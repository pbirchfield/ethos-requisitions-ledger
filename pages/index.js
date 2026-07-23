import fs from "fs";
import path from "path";
import Head from "next/head";
import Script from "next/script";

export default function Home({ bodyHtml }) {
  return (
    <>
      <Head>
        <title>Ethos Solutions — Requisition Ledger</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      {/* The tool's markup, unchanged from the original build */}
      <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />

      {/* The tool's logic, adapted to call /api/storage instead of
          Claude's window.storage. Loaded after the DOM above exists. */}
      <Script src="/app.js" strategy="afterInteractive" />
    </>
  );
}

// Read body.html once at build time and inline it — avoids any
// runtime file-system access and keeps this a fully static page
// aside from the /api/storage calls made by app.js.
export async function getStaticProps() {
  const bodyHtml = fs.readFileSync(
    path.join(process.cwd(), "body.html"),
    "utf8"
  );
  return { props: { bodyHtml } };
}
