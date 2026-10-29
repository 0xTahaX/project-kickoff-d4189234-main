import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import express, { type Express, type RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import type { AppConfig } from "./config/env.js";
import { errorHandler, sendError } from "./http/errors.js";
import { IranMarketSnapshotService, type MarketSnapshotReader } from "./market-data/snapshot.js";
import {
  BlockscoutEthereumProvider,
  type EthereumWalletReader,
} from "./blockchain/ethereum-provider.js";
import { AssistantService } from "./assistant/assistant.js";
import type { AuthRepository } from "./domain/auth.js";
import { authentication } from "./auth/middleware.js";
import { createAuthRouter, createProfileRouter, type Mailer } from "./auth/routes.js";
import type { FinanceStore } from "./finance/finance.repository.js";
import { createFinanceRouter } from "./finance/routes.js";

export interface AppDependencies {
  config: Pick<AppConfig, "nodeEnv" | "webOrigin">;
  marketData?: MarketSnapshotReader;
  ethereumWallets?: EthereumWalletReader;
  databaseHealth?: () => Promise<void>;
  auth?: {
    repository: AuthRepository;
    appUrl: string;
    mailer: Mailer | null;
    mailFrom: string | undefined;
  };
  finance?: FinanceStore;
}

// ساخت اپ مستقل از DB واقعی کمک می‌کند API با repository آزمایشی یکپارچه تست شود.
export function createApp(dependencies: AppDependencies): Express {
  const app = express();
  const secureCookie = dependencies.config.nodeEnv === "production";
  const webDist = fileURLToPath(new URL("../../web/dist/", import.meta.url));
  const legacyRoot = path.join(webDist, "legacy");
  const marketData = dependencies.marketData ?? new IranMarketSnapshotService();
  const ethereumWallets = dependencies.ethereumWallets ?? new BlockscoutEthereumProvider();
  const assistant = new AssistantService();
  const blockchainReadLimit = rateLimit({
    windowMs: 60_000,
    limit: 12,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  app.disable("x-powered-by");
  app.set("trust proxy", secureCookie ? 1 : false);
  app.use((_request, response, next) => {
    response.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
    });
    next();
  });
  app.use(express.json({ limit: "20kb", strict: true }));

  // مبدأ مجاز یا WEB_ORIGIN است یا همان میزبانی که صفحه از آن بارگذاری شده (پیش‌نمایش پشت پراکسی).
  const isAllowedOrigin = (origin: string, host: string | undefined) => {
    if (origin.replace(/\/+$/, "") === dependencies.config.webOrigin) return true;
    try {
      return Boolean(host) && new URL(origin).host === host;
    } catch {
      return false;
    }
  };

  // درخواست‌های مرورگر فقط از origin برنامه و با نشانگر CSRF تغییر ایجاد می‌کنند.
  const protectMutation: RequestHandler = (request, response, next) => {
    if (!["POST", "PATCH", "PUT", "DELETE"].includes(request.method)) {
      next();
      return;
    }
    const origin = request.get("Origin");
    if (origin && !isAllowedOrigin(origin, request.get("Host"))) {
      sendError(response, 403, "CSRF", "درخواست از مبدأ مجاز ارسال نشده است.");
      return;
    }
    if (request.get("X-Requested-With") !== "dara") {
      sendError(response, 403, "CSRF", "درخواست معتبر نیست.");
      return;
    }
    next();
  };
  app.use(protectMutation);
  if (dependencies.auth) {
    const { repository, appUrl, mailer, mailFrom } = dependencies.auth;
    app.use(authentication(repository));
    app.use(
      "/api/auth",
      createAuthRouter({
        repository,
        config: { nodeEnv: dependencies.config.nodeEnv, appUrl },
        mailer,
        mailFrom,
      }),
    );
    app.use("/api/me", createProfileRouter(repository, secureCookie));
    if (dependencies.finance) app.use("/api/finance", createFinanceRouter(dependencies.finance));
  }
  app.get("/api/health", async (_request, response) => {
    if (dependencies.databaseHealth) {
      try {
        await dependencies.databaseHealth();
      } catch (error) {
        console.error("Database health check failed:", {
          name: error instanceof Error ? error.name : "UnknownError",
        });
        response.status(503).json({ status: "unavailable", database: "unavailable" });
        return;
      }
    }
    response.json({
      status: "ok",
      ...(dependencies.databaseHealth ? { database: "ok" } : {}),
    });
  });
  app.get("/api/assistant/status", (_request, response) => {
    response.set("Cache-Control", "no-store");
    response.json(assistant.status());
  });
  app.get("/api/markets", async (_request, response, next) => {
    try {
      response.set("Cache-Control", "no-store");
      response.json(await marketData.getSnapshot());
    } catch (error) {
      next(error);
    }
  });
  app.get(
    "/api/blockchain/ethereum/:address",
    blockchainReadLimit,
    async (request, response) => {
      const address = request.params.address;
      if (typeof address !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        sendError(response, 400, "INVALID_ADDRESS", "نشانی عمومی Ethereum معتبر نیست.");
        return;
      }
      try {
        response.set("Cache-Control", "no-store");
        response.json(await ethereumWallets.readAddress(address));
      } catch (error) {
        console.warn("Ethereum wallet synchronization failed:", {
          name: error instanceof Error ? error.name : "UnknownError",
        });
        sendError(
          response,
          502,
          "BLOCKCHAIN_UNAVAILABLE",
          "اطلاعات این کیف پول فعلاً از Blockscout دریافت نشد. بعداً دوباره تلاش کنید.",
        );
      }
    },
  );
  app.use("/legacy", express.static(legacyRoot, { index: "index.html" }));

  if (existsSync(path.join(webDist, "index.html"))) {
    app.use(express.static(webDist, { index: false, fallthrough: true }));
    app.get(/.*/, (request, response, next) => {
      if (
        request.path === "/auth" ||
        request.path.startsWith("/auth/") ||
        request.path === "/me" ||
        request.path.startsWith("/me/")
      ) {
        next();
        return;
      }
      response.sendFile(path.join(webDist, "index.html"), (error) => {
        if (error && !response.headersSent) next(error);
      });
    });
  }

  app.use((request, response) => {
    sendError(response, 404, "NOT_FOUND", `مسیر ${request.method} ${request.path} پیدا نشد.`);
  });
  app.use(errorHandler);
  return app;
}
