"use client";

import Link from "next/link";

export function DownloadButton() {
  const platform = typeof navigator === "undefined" ? "desktop" : /Android/i.test(navigator.userAgent) ? "android" : /iPhone|iPad/i.test(navigator.userAgent) ? "ios" : "desktop";
  const label = platform === "ios" ? "获取 iOS 版本" : platform === "android" ? "获取 Android 版本" : "加入桌面端等待名单";

  return <Link href="/download" className="button">{label}</Link>;
}
