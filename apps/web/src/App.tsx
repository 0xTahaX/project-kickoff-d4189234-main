import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";

const previewPath = () => `/legacy/index.html${window.location.search}`;
const redirectToPreview = () => window.location.replace(previewPath());

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
            <p>برای ساخت حساب، ایمیل باید تأیید شود. تراکنش‌ها، حساب‌ها، دسته‌بندی‌ها و فضای کاری داشبورد پس از ورود در پایگاه دادهٔ سرور ذخیره و با شناسهٔ مالک از دادهٔ سایر کاربران جدا می‌شوند.</p>
          </article>
        }
      />
      <Route path="*" element={<PreviewRedirect redirect={onPreviewRedirect} />} />
    </Routes>
  );
}
