"use client";
import React, { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QRCodeSVG({
  value,
  size = 180,
  fgColor = "#000000",
  bgColor = "#ffffff",
  className = "",
}: {
  value: string;
  size?: number;
  fgColor?: string;
  bgColor?: string;
  className?: string;
}) {
  const [svgXml, setSvgXml] = useState<string>("");

  useEffect(() => {
    let isMounted = true;
    const text = value || "https://doppelganger.site";

    QRCode.toString(text, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 2,
      color: {
        dark: fgColor === "transparent" ? "#000000" : fgColor,
        light: bgColor === "transparent" ? "#00000000" : bgColor,
      },
      width: size,
    })
      .then((xml) => {
        if (isMounted) setSvgXml(xml);
      })
      .catch((err) => {
        console.error("QR Generation error:", err);
      });

    return () => {
      isMounted = false;
    };
  }, [value, size, fgColor, bgColor]);

  if (!svgXml) {
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          background: bgColor === "transparent" ? "#ffffff" : bgColor,
          borderRadius: 8,
          display: "inline-grid",
          placeItems: "center",
        }}
      />
    );
  }

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        display: "inline-block",
        lineHeight: 0,
        borderRadius: 8,
        overflow: "hidden",
      }}
      dangerouslySetInnerHTML={{ __html: svgXml }}
    />
  );
}
