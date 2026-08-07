"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

export function AnalyticsConsent({ metaPixelId, gaMeasurementId }: { metaPixelId: string; gaMeasurementId: string }) {
  const enabled = Boolean(metaPixelId || gaMeasurementId);
  const [choice, setChoice] = useState<"accepted" | "essential" | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setChoice(localStorage.getItem("muse-cookie-choice") as "accepted" | "essential" | null), 0);
    return () => clearTimeout(timer);
  }, []);
  if (!enabled) return null;
  function choose(value: "accepted" | "essential") {
    localStorage.setItem("muse-cookie-choice", value); setChoice(value);
  }
  return <>
    {choice === "accepted" && gaMeasurementId && <><Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaMeasurementId)}`} strategy="lazyOnload" /><Script id="muse-google-analytics" strategy="lazyOnload">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config',${JSON.stringify(gaMeasurementId)},{anonymize_ip:true});`}</Script></>}
    {choice === "accepted" && metaPixelId && <Script id="muse-meta-pixel" strategy="lazyOnload">{`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${JSON.stringify(metaPixelId)});fbq('track','PageView');`}</Script>}
    {choice === null && <aside className="cookie-banner"><div><strong>A considered digital experience</strong><p>With your permission, optional analytics help us understand visits and improve advertising. Essential store functions always remain active.</p></div><button onClick={() => choose("essential")}>Essential only</button><button className="button-dark" onClick={() => choose("accepted")}>Allow analytics</button></aside>}
  </>;
}
