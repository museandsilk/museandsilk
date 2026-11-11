"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

export function AnalyticsConsent({
  metaPixelId,
  gaMeasurementId,
  tiktokPixelId = "",
  nonce,
}: {
  metaPixelId: string;
  gaMeasurementId: string;
  tiktokPixelId?: string;
  nonce: string;
}) {
  const enabled = Boolean(metaPixelId || gaMeasurementId || tiktokPixelId);
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
    {choice === "accepted" && gaMeasurementId && <><Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaMeasurementId)}`} strategy="lazyOnload" /><Script id="muse-google-analytics" strategy="lazyOnload" nonce={nonce}>{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config',${JSON.stringify(gaMeasurementId)},{anonymize_ip:true});`}</Script></>}
    {choice === "accepted" && tiktokPixelId && <Script id="muse-tiktok-pixel" strategy="lazyOnload" nonce={nonce}>{`!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=r;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};var s=document.createElement("script");s.type="text/javascript";s.async=!0;s.src=r+"?sdkid="+e+"&lib="+t;var x=document.getElementsByTagName("script")[0];x.parentNode.insertBefore(s,x)};ttq.load(${JSON.stringify(tiktokPixelId)});ttq.page()}(window,document,"ttq");`}</Script>}
    {choice === "accepted" && metaPixelId && <Script id="muse-meta-pixel" strategy="lazyOnload" nonce={nonce}>{`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${JSON.stringify(metaPixelId)});fbq('track','PageView');`}</Script>}
    {choice === null && <aside className="cookie-banner"><div><strong>A considered digital experience</strong><p>With your permission, optional analytics help us understand visits and improve advertising. Essential store functions always remain active.</p></div><button onClick={() => choose("essential")}>Essential only</button><button className="button-dark" onClick={() => choose("accepted")}>Allow analytics</button></aside>}
  </>;
}
