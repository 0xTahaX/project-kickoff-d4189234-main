import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("App guest dashboard", () => {
  it.each(["/", "/login", "/register", "/forgot-password", "/reset-password"])(
    "redirects %s to the guest dashboard",
    (path) => {
      const redirect = vi.fn();
      render(
        <MemoryRouter initialEntries={[path]}>
          <App onPreviewRedirect={redirect} />
        </MemoryRouter>,
      );

      expect(redirect).toHaveBeenCalledOnce();
      expect(screen.queryByRole("heading", { name: "ورود به دارا" })).not.toBeInTheDocument();
    },
  );

  it("redirects unknown paths to the guest dashboard", () => {
    const redirect = vi.fn();
    render(
      <MemoryRouter initialEntries={["/unknown"]}>
        <App onPreviewRedirect={redirect} />
      </MemoryRouter>,
    );

    expect(redirect).toHaveBeenCalledOnce();
  });
});
