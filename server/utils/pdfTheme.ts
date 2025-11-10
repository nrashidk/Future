import PDFDocument from "pdfkit";

// Color palette matching the sticky notes design
export const colors = {
  // Hero gradient
  primaryStart: "#5B3CFF",
  primaryEnd: "#7C5CFF",
  
  // Sticky note backgrounds
  stickyYellow: "#FFF3B0",
  stickyPink: "#FDDCDC",
  stickyBlue: "#D6E4FF",
  stickyGreen: "#DDF7E3",
  stickyPurple: "#EBDFFC",
  
  // Text colors
  textDark: "#1F2937",
  textMedium: "#4B5563",
  textLight: "#6B7280",
  textMuted: "#9CA3AF",
  
  // Accent colors
  primary: "#6B46C1",
  primaryDark: "#5B3CFF",
  accent: "#F59E0B",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
  
  // Progress bar
  progressTrack: "#E5E7EB",
  progressFill: "#6B46C1",
  
  // Badge colors
  badgeBg: "#6B46C1",
  badgeText: "#FFFFFF",
  competencyBg: "#EBDFFC",
  visionBg: "#FFF3B0",
};

// Layout constants
export const layout = {
  PAGE_MARGIN: 40,
  CARD_GAP: 16,
  LINE_HEIGHT: 16,
  PADDING: 20,
  BADGE_PADDING_X: 12,
  BADGE_PADDING_Y: 6,
  BADGE_RADIUS: 12,
  CARD_RADIUS: 12,
};

// Helper: Check if there's enough space on current page, add new page if needed
export function ensurePageSpace(doc: typeof PDFDocument.prototype, neededHeight: number, cursorY: number): number {
  const pageHeight = doc.page.height - doc.page.margins.bottom - 20;
  if (cursorY + neededHeight > pageHeight) {
    doc.addPage();
    return doc.page.margins.top;
  }
  return cursorY;
}

// Helper: Draw gradient header
export function drawGradientHeader(
  doc: typeof PDFDocument.prototype,
  options: { title: string; subtitle: string; iconLabel?: string }
) {
  const { title, subtitle, iconLabel = "★" } = options;
  const width = doc.page.width;
  const height = 140;
  
  // Draw gradient background (simulate with two rectangles)
  doc.save();
  doc.rect(0, 0, width, height).fill(colors.primaryStart);
  doc.rect(0, 0, width, height).fillOpacity(0.5).fill(colors.primaryEnd);
  doc.restore();
  
  // Draw icon badge (circle with icon)
  const badgeX = width / 2;
  const badgeY = 40;
  const badgeRadius = 30;
  doc.save();
  doc.circle(badgeX, badgeY, badgeRadius).fillOpacity(0.3).fill("#FFFFFF");
  doc.restore();
  
  // Icon text
  doc.fontSize(32).fillColor("#FFFFFF").text(iconLabel, 0, badgeY - 16, {
    width: width,
    align: "center"
  });
  
  // Title
  doc.fontSize(32).font("Helvetica-Bold").fillColor("#FFFFFF").text(title, 0, 80, {
    width: width,
    align: "center"
  });
  
  // Subtitle
  doc.fontSize(14).font("Helvetica").fillColor("#FFFFFF").fillOpacity(0.95).text(subtitle, 0, 115, {
    width: width,
    align: "center"
  });
  doc.fillOpacity(1);
  
  return height + 20; // Return height consumed
}

// Helper: Draw sticky note card with dynamic height
export function drawStickyCard(
  doc: typeof PDFDocument.prototype,
  options: {
    x: number;
    y: number;
    width: number;
    color: string;
    padding?: number;
    minHeight?: number; // Minimum card height
    renderContent: (doc: typeof PDFDocument.prototype, contentX: number, contentY: number, contentWidth: number) => number;
  }
): number {
  const { x, y, width, color, padding = layout.PADDING, minHeight = 200, renderContent } = options;
  
  // Calculate content area
  const contentX = x + padding;
  const contentY = y + padding + 10; // Extra space for tape
  const contentWidth = width - padding * 2;
  
  // Use a very generous estimated height to ensure backgrounds always cover content
  // Cards will have some extra colored space at bottom, but no overflow
  const estimatedHeight = Math.max(minHeight, 850);
  
  // Draw background rectangle FIRST (before content)
  doc.save();
  doc.roundedRect(x, y, width, estimatedHeight, layout.CARD_RADIUS).fill(color);
  
  // Optional: Draw tape effect at top (semi-transparent strip)
  const tapeWidth = 80;
  const tapeHeight = 20;
  const tapeX = x + (width - tapeWidth) / 2;
  doc.rect(tapeX, y, tapeWidth, tapeHeight).fillOpacity(0.2).fill("#000000");
  doc.restore();
  
  // Now render content on top of the background
  const contentHeight = renderContent(doc, contentX, contentY, contentWidth);
  
  // Calculate actual card height based on content
  const actualCardHeight = contentHeight + padding * 2 + 10;
  
  // Return the actual height for cursor positioning
  // Note: If content is taller than estimated, it will overflow the background
  // but that's okay - we use a large enough estimate to avoid this
  return Math.max(actualCardHeight, estimatedHeight);
}

// Helper: Draw progress bar
export function drawProgressBar(
  doc: typeof PDFDocument.prototype,
  options: {
    x: number;
    y: number;
    width: number;
    height?: number;
    value: number; // 0-100
    trackColor?: string;
    fillColor?: string;
  }
) {
  const {
    x,
    y,
    width,
    height = 8,
    value,
    trackColor = colors.progressTrack,
    fillColor = colors.progressFill,
  } = options;
  
  // Draw track (background)
  doc.save();
  doc.roundedRect(x, y, width, height, height / 2).fill(trackColor);
  
  // Draw fill (value)
  const fillWidth = (width * Math.min(value, 100)) / 100;
  if (fillWidth > 0) {
    doc.roundedRect(x, y, fillWidth, height, height / 2).fill(fillColor);
  }
  doc.restore();
}

// Helper: Draw badge/pill
export function drawBadge(
  doc: typeof PDFDocument.prototype,
  options: {
    x: number;
    y: number;
    text: string;
    background?: string;
    foreground?: string;
    paddingX?: number;
    paddingY?: number;
    radius?: number;
    fontSize?: number;
  }
): { width: number; height: number } {
  const {
    x,
    y,
    text,
    background = colors.badgeBg,
    foreground = colors.badgeText,
    paddingX = layout.BADGE_PADDING_X,
    paddingY = layout.BADGE_PADDING_Y,
    radius = layout.BADGE_RADIUS,
    fontSize = 10,
  } = options;
  
  doc.save();
  doc.fontSize(fontSize).font("Helvetica-Bold");
  const textWidth = doc.widthOfString(text);
  const badgeWidth = textWidth + paddingX * 2;
  const badgeHeight = fontSize + paddingY * 2;
  
  // Draw rounded rectangle
  doc.roundedRect(x, y, badgeWidth, badgeHeight, radius).fill(background);
  
  // Draw text centered
  doc.fillColor(foreground).text(text, x + paddingX, y + paddingY, {
    width: textWidth,
    align: "left",
  });
  doc.restore();
  
  return { width: badgeWidth, height: badgeHeight };
}

// Helper: Draw circular badge (for match score)
export function drawCircularBadge(
  doc: typeof PDFDocument.prototype,
  options: {
    x: number;
    y: number;
    text: string;
    radius?: number;
    background?: string;
    foreground?: string;
  }
) {
  const {
    x,
    y,
    text,
    radius = 30,
    background = colors.primary,
    foreground = "#FFFFFF",
  } = options;
  
  doc.save();
  // Draw circle
  doc.circle(x, y, radius).fill(background);
  
  // Draw text centered
  doc.fontSize(16).font("Helvetica-Bold").fillColor(foreground).text(text, x - radius, y - 8, {
    width: radius * 2,
    align: "center",
  });
  doc.restore();
}

// Helper: Draw metric row with progress bar
export function drawMetricRow(
  doc: typeof PDFDocument.prototype,
  options: {
    x: number;
    y: number;
    width: number;
    label: string;
    value: number; // percentage
    weight?: string;
    icon?: string;
  }
): number {
  const { x, y, width, label, value, weight, icon = "●" } = options;
  
  // Label and value
  doc.fontSize(9).font("Helvetica").fillColor(colors.textMedium);
  doc.text(`${icon} ${label}`, x, y, { continued: true, width: width * 0.6 });
  doc.fillColor(colors.textDark).font("Helvetica-Bold").text(`${Math.round(value)}%`, { align: "right" });
  
  // Progress bar
  const barY = y + 14;
  drawProgressBar(doc, { x, y: barY, width: width, value });
  
  // Weight text (if provided)
  if (weight) {
    doc.fontSize(7).fillColor(colors.textMuted).font("Helvetica").text(weight, x, barY + 10);
  }
  
  return weight ? 36 : 26; // Height consumed
}

// Helper: Draw insight row with icon
export function drawInsightRow(
  doc: typeof PDFDocument.prototype,
  options: {
    x: number;
    y: number;
    width: number;
    text: string;
    icon?: string;
    iconColor?: string;
  }
): number {
  const { x, y, width, text, icon = "✓", iconColor = colors.success } = options;
  
  const iconSize = 10;
  const iconX = x;
  const textX = x + iconSize + 6;
  const textWidth = width - iconSize - 6;
  
  // Draw icon (simple circle with symbol)
  doc.fontSize(iconSize).fillColor(iconColor).text(icon, iconX, y);
  
  // Draw text
  doc.fontSize(9).font("Helvetica").fillColor(colors.textMedium);
  const textHeight = doc.heightOfString(text, { width: textWidth, lineGap: 2 });
  doc.text(text, textX, y, { width: textWidth, lineGap: 2 });
  
  return textHeight + 6;
}

// Helper: Get sticky note color by index
export function getStickyColor(index: number): string {
  const stickyColors = [
    colors.stickyYellow,
    colors.stickyPink,
    colors.stickyBlue,
    colors.stickyGreen,
    colors.stickyPurple,
  ];
  return stickyColors[index % stickyColors.length];
}
