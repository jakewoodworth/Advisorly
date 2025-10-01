declare module "@react-pdf/renderer" {
  import * as React from "react";

  export interface PDFRendererProps {
    children?: React.ReactNode;
  }

  type Style = Record<string, unknown>;

  export const Document: React.FC<PDFRendererProps>;
  export const Page: React.FC<PDFRendererProps & { size?: string | [number, number]; style?: Style }>;
  export const View: React.FC<PDFRendererProps & { style?: Style }>;
  export const Text: React.FC<PDFRendererProps & { style?: Style }>;
  export const StyleSheet: { create: <T extends Record<string, Style>>(styles: T) => T };
  export const Font: { register: (config: { family: string; src: string }) => void };
  export function renderToStream(element: React.ReactElement): Promise<NodeJS.ReadableStream>;
}
