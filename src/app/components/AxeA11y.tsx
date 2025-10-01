"use client";

import { useEffect } from "react";
import * as React from "react";
import * as ReactDOM from "react-dom";

export function AxeA11y() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const timeout = window.setTimeout(() => {
      import("@axe-core/react").then(({ default: axe }) => {
        axe(React, ReactDOM, 1000);
      });
    }, 2000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, []);

  return null;
}
