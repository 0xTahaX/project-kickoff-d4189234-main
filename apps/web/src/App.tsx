import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";

const previewPath = "/legacy/index.html?preview=1";
const redirectToPreview = () => window.location.replace(previewPath);

function PreviewRedirect({ redirect }: { redirect: () => void }) {
  useEffect(() => {
    redirect();
  }, [redirect]);
  return <p role="status">در حال باز کردن داشبورد پیش‌نمایش…</p>;
}

export function App({
  onPreviewRedirect = redirectToPreview,
}: {
  onPreviewRedirect?: () => void;
} = {}) {
  return (
    <Routes>
      <Route path="/" element={<PreviewRedirect redirect={onPreviewRedirect} />} />
      <Route
        path="/terms"
        element={
          <article className="document">
            <h1>شرایط استفاده از دارا</h1>
            <p>دارا ابزاری برای ثبت و مرور اطلاعات مالی شخصی است؛ برآوردهای آن توصیهٔ سرمایه‌گذاری نیستند.</p>
            <p>اطلاعاتی که ثبت می‌کنید باید دقیق باشد و مسئولیت نگهداری امن آن‌ها بر عهدهٔ شماست.</p>
          </article>
        }
      />
      <Route
        path="/privacy"
        element={
          <article className="document">
            <h1>حریم خصوصی</h1>
            <p>تراکنش‌ها، حساب‌ها و دسته‌بندی‌های شما پس از ورود در پایگاه دادهٔ دارا (Supabase) ذخیره می‌شوند و فقط برای خود شما قابل دسترسی‌اند؛ بقیهٔ تنظیمات داشبورد در مرورگر می‌ماند.</p>
          </article>
        }
      />
      <Route path="*" element={<PreviewRedirect redirect={onPreviewRedirect} />} />
    </Routes>
  );
}
