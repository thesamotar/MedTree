import "./globals.css";



export const metadata = {
  title: "MedTree | Medical Correlation Engine",
  description: "Cognee Hackathon - Emergency Medical Decision Support Engine using multi-hop graph retrieval.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
