import type { Metadata } from 'next';
import { Cairo } from 'next/font/google';
import './globals.css';
import { Toaster } from 'react-hot-toast';
import { LanguageProvider } from '@/lib/i18n/context';

const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  variable: '--font-cairo',
  display: 'swap',
});

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME || 'نظام إدارة الأصول الكهربائية والصيانة',
  description: 'نظام متكامل لإدارة الأصول الكهربائية والاختبارات والصيانة للمباني',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // اللغة الافتراضية عربية؛ LanguageProvider يعدّل lang/dir على <html> بعد التحميل
  // حسب اختيار المستخدم المحفوظ. suppressHydrationWarning لأن السمتين تتغيران في العميل.
  return (
    <html lang="ar" dir="rtl" className={cairo.variable} suppressHydrationWarning>
      <body className="font-cairo">
        <LanguageProvider>
          {children}
          <Toaster position="top-center" toastOptions={{ duration: 3500 }} />
        </LanguageProvider>
      </body>
    </html>
  );
}
