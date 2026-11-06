import "../src/index.css";

export const metadata = {
  title: "Seal22",
  description: "Constructor de apps con precio visible, cuentas y sandbox.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
