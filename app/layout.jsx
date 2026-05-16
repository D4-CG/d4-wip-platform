export const metadata = {
  title: "D4 WIP Intelligence Platform",
  description: "Revenue cycle work-in-progress management for PE-backed healthcare platforms",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
