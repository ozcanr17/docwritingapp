export interface ResponsiveLayout {
  compactSidebar: boolean;
  overlayDetails: boolean;
  stackSplit: boolean;
}

export function resolveResponsiveLayout(width: number): ResponsiveLayout {
  return {
    compactSidebar: width < 960,
    overlayDetails: width < 1180,
    stackSplit: width < 900,
  };
}
