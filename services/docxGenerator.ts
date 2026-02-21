import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  SectionType,
  ShadingType,
  Footer,
  Header,
  SimpleField,
  VerticalAlign,
  TabStopType,
  TableLayoutType,
  ExternalHyperlink
} from "docx";
import FileSaver from "file-saver";
import { ArticleData } from "../types";

// --- CONSTANTS ---
// Changed to Times New Roman as per international standards (Elsevier/Scopus)
const FONT_FAMILY = "Times New Roman"; 
// 2.2 cm at 96 DPI is approx 83 px
const LOGO_SIZE_PX = 83; 
// Size 18pt = 36 half-points
const TITLE_SIZE = 36; 
// CHANGED: 22 half-points = 11pt (Body Text)
const BODY_FONT_SIZE = 22; 
// CHANGED: 24 half-points = 12pt (Headers)
const HEADER_FONT_SIZE = 24;

// Helper to fetch Blob from URL (for logo) or File
const getImageData = async (source: string | File): Promise<ArrayBuffer> => {
  try {
    if (source instanceof File) {
      return await source.arrayBuffer();
    }
    const response = await fetch(source);
    if (!response.ok) throw new Error("Failed to fetch image");
    return await response.arrayBuffer();
  } catch (error) {
    console.error("Error getting image data:", error);
    return new ArrayBuffer(0);
  }
};

// Helper for "Capitalize Each Word"
const toTitleCase = (str: string) => {
  if (!str) return '';
  return str.replace(
    /\w\S*/g,
    (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  );
};

// Helper function to turn LaTeX/Math code into readable text
const formatMathEquation = (latex: string): string => {
    let text = latex;
    // Replace standard LaTeX commands with readable symbols
    text = text.replace(/\\frac\{(.*?)\}\{(.*?)\}/g, "($1 / $2)"); // Fractions
    text = text.replace(/\\times/g, " × ");
    text = text.replace(/\\cdot/g, " · ");
    text = text.replace(/\\pm/g, " ± ");
    text = text.replace(/\\approx/g, " ≈ ");
    text = text.replace(/\\le/g, " ≤ ");
    text = text.replace(/\\ge/g, " ≥ ");
    text = text.replace(/\\rightarrow/g, " → ");
    text = text.replace(/\\text\{(.*?)\}/g, "$1"); // Remove text wrappers
    text = text.replace(/\\mathit\{(.*?)\}/g, "$1");
    // Clean up braces that might be left
    text = text.replace(/[\{\}]/g, "");
    
    return text;
};

// Advanced Parser for Inline Formatting: Bold, Italic, Subscript (_), Superscript (^)
const parseTextToRuns = (text: string, forceBold = false, fontSize = BODY_FONT_SIZE): TextRun[] => {
  if (!text) return [new TextRun({ text: "", font: FONT_FAMILY, size: fontSize })]; 

  // Regex to capture tokens:
  // 1. $$...$$ (Inline Math)
  // 2. **...** (Bold)
  // 3. *...* (Italic)
  // 4. _{...} or _char (Subscript) - e.g. H_2O or Na_{3}
  // 5. ^{...} or ^char (Superscript) - e.g. 10^6 or 10^{6}
  
  const regex = /(\$\$.*?\$\$|\*\*.*?\*\*|\*.*?\*|\_\{.*?\}|\_[0-9a-zA-Z]|\^\{.*?\}|\^[0-9a-zA-Z])/g;
  const parts = text.split(regex);

  return parts.flatMap((part) => {
    if (!part) return [];

    // --- INLINE MATH ($$ ... $$) ---
    // Treat as normal text but strip $$ and apply formatting logic recursively
    if (part.startsWith("$$") && part.endsWith("$$")) {
        const raw = part.slice(2, -2);
        const readable = formatMathEquation(raw);
        // Recursive call to handle sub/super scripts inside the math block
        // e.g. $$Na_3$$ -> Na_3 -> Na + sub(3)
        return parseTextToRuns(readable, forceBold, fontSize);
    }

    // --- BOLD ---
    if (part.startsWith("**") && part.endsWith("**")) {
      return new TextRun({
        text: part.slice(2, -2),
        bold: true,
        font: FONT_FAMILY,
        size: fontSize
      });
    } 
    
    // --- ITALIC ---
    if (part.startsWith("*") && part.endsWith("*")) {
      return new TextRun({
        text: part.slice(1, -1),
        italics: true,
        font: FONT_FAMILY,
        size: fontSize
      });
    }

    // --- SUBSCRIPT (_) ---
    if (part.startsWith("_")) {
        let content = part.substring(1);
        if (content.startsWith("{") && content.endsWith("}")) content = content.slice(1, -1);
        return new TextRun({ text: content, subScript: true, font: FONT_FAMILY, size: fontSize });
    }

    // --- SUPERSCRIPT (^) ---
    if (part.startsWith("^")) {
        let content = part.substring(1);
        if (content.startsWith("{") && content.endsWith("}")) content = content.slice(1, -1);
        return new TextRun({ text: content, superScript: true, font: FONT_FAMILY, size: fontSize });
    }

    // --- PLAIN TEXT ---
    return new TextRun({ text: part, bold: forceBold, font: FONT_FAMILY, size: fontSize });
  });
};

const parseMarkdownTable = (tableBlock: string): Table | null => {
  try {
    const lines = tableBlock.trim().split('\n');
    if (lines.length < 2) return null;

    const rows = lines.map(line => {
      const content = line.trim();
      const cleaned = content.replace(/^\|/, '').replace(/\|$/, '');
      return cleaned.split('|').map(c => c.trim());
    });

    const dataRows = rows.filter((row) => !row.every(cell => /^-+$/.test(cell)));
    if (dataRows.length === 0) return null;
    
    const colCount = dataRows[0].length;
    const totalRows = dataRows.length;

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.AUTOFIT,
      borders: {
          top: { style: BorderStyle.NONE },
          bottom: { style: BorderStyle.NONE },
          left: { style: BorderStyle.NONE },
          right: { style: BorderStyle.NONE },
          insideVertical: { style: BorderStyle.NONE },
          insideHorizontal: { style: BorderStyle.NONE } 
      },
      rows: dataRows.map((rowCells, rowIndex) => {
        const isHeader = rowIndex === 0;
        const isLastRow = rowIndex === totalRows - 1;
        
        let rowBorders = {};
        
        if (isHeader) {
            rowBorders = {
                top: { style: BorderStyle.SINGLE, size: 12, color: "000000" }, 
                bottom: { style: BorderStyle.SINGLE, size: 2, color: "000000" }
            };
        } else if (isLastRow) {
            rowBorders = {
                bottom: { style: BorderStyle.SINGLE, size: 2, color: "000000" }
            };
        }

        const safeCells = [...rowCells];
        while (safeCells.length < colCount) safeCells.push("");
        while (safeCells.length > colCount) safeCells.pop();

        return new TableRow({
          children: safeCells.map(cellText => 
            new TableCell({
              children: [new Paragraph({ 
                  children: parseTextToRuns(cellText, isHeader, 20), // Tables slightly smaller (10pt) usually
                  alignment: isHeader ? AlignmentType.CENTER : AlignmentType.LEFT,
                  spacing: { before: 60, after: 60 }
              })],
              width: { size: 100 / colCount, type: WidthType.PERCENTAGE },
              borders: {
                 ...rowBorders,
                 left: { style: BorderStyle.NONE },
                 right: { style: BorderStyle.NONE },
              },
              shading: isHeader ? { fill: "f1f5f9", type: ShadingType.CLEAR, color: "auto" } : undefined,
              margins: { top: 100, bottom: 100, left: 100, right: 100 }
            })
          )
        });
      })
    });
  } catch (e) {
    console.warn("Table parsing failed", e);
    return null;
  }
};

export const generateDocx = async (data: ArticleData) => {
  // Pre-process Data
  const uniqueAffiliations = [...new Set((data.authors || []).map((a) => a.affiliation))];
  const correspondingAuthor = (data.authors || []).find(a => a.isCorresponding);
  
  // Prepare Correspondence Children for DOCX
  const correspondenceChildren: (TextRun | ExternalHyperlink)[] = [];
  if (correspondingAuthor?.email) {
      correspondenceChildren.push(new TextRun({ text: "*Correspondence: ", size: 16, font: FONT_FAMILY }));
      correspondenceChildren.push(new ExternalHyperlink({
          children: [
            new TextRun({ 
                text: correspondingAuthor.email, 
                size: 16, 
                font: FONT_FAMILY,
                color: "0c4a6e", // Brand color
                underline: { type: "single", color: "0c4a6e" } 
            })
          ],
          link: `mailto:${correspondingAuthor.email}`
      }));
  }

  // 1. Author Runs
  const authorRuns: TextRun[] = [];
  (data.authors || []).forEach((author, index) => {
      authorRuns.push(new TextRun({ text: author.name || "Author", bold: true, size: 22, font: FONT_FAMILY })); 
      const affIndex = uniqueAffiliations.indexOf(author.affiliation) + 1;
      let meta = `${affIndex}`;
      if (author.isCorresponding) meta += "*";
      authorRuns.push(new TextRun({ text: meta, bold: true, size: 22, font: FONT_FAMILY, superScript: true }));
      if (index < (data.authors || []).length - 1) {
          authorRuns.push(new TextRun({ text: ", ", bold: true, size: 22, font: FONT_FAMILY }));
      }
  });

  // 2. Affiliation Runs
  const affRuns: TextRun[] = [];
  uniqueAffiliations.forEach((aff, i) => {
      if (i > 0) affRuns.push(new TextRun({ text: "\n", font: FONT_FAMILY }));
      affRuns.push(new TextRun({ text: `${i + 1}`, size: 20, font: FONT_FAMILY, superScript: true }));
      affRuns.push(new TextRun({ text: ` ${aff}`, italics: true, size: 20, font: FONT_FAMILY }));
  });

  // 3. Citation
  const firstAuthor = data.authors?.[0]?.name || "Author";
  const firstAuthorSurname = firstAuthor.split(' ').pop() || firstAuthor;
  const runningAuthor = (data.authors || []).length > 1 ? `${firstAuthorSurname} et al.` : firstAuthorSurname;
  const etAl = (data.authors || []).length > 1 ? " et al." : "";
  const titleFormatted = toTitleCase(data.title || "Untitled Article");
  const year = new Date().getFullYear();
  const citationRuns: (TextRun | ExternalHyperlink)[] = [
      new TextRun({ text: "Cite this article: ", bold: true, size: 20, font: FONT_FAMILY, color: "0c4a6e" }), // Brand color 900
      new TextRun({ text: `${firstAuthor}${etAl} (${year}). ${titleFormatted}. `, size: 20, font: FONT_FAMILY }),
      new TextRun({ text: "Journal of Biomedical Sciences and Health", italics: true, size: 20, font: FONT_FAMILY }),
      new TextRun({ text: ", ", size: 20, font: FONT_FAMILY }),
      new TextRun({ text: data.volume || 'X', italics: true, size: 20, font: FONT_FAMILY }),
      new TextRun({ text: `(${data.issue || 'X'}), ${data.pages || '...'}. `, size: 20, font: FONT_FAMILY }),
      new ExternalHyperlink({
          children: [
            new TextRun({ text: `https://doi.org/${data.doi || '...'}`, size: 20, font: FONT_FAMILY, color: "0ea5e9", underline: { type: "single", color: "0ea5e9" } })
          ],
          link: `https://doi.org/${data.doi || '...'}`
      })
  ];
  const journalInfoShort = `J. Biomed. Sci. Health. ${year}; ${data.volume || '3'}(${data.issue || '1'}): ${data.pages || '1-10'}`;

  // 4. Logo
  const CC_LOGO_URL = "https://licensebuttons.net/l/by/4.0/88x31.png";
  let logoImage: ImageRun | undefined;
  let ccLogoImage: ImageRun | undefined;

  if (data.logoUrl) {
    try {
      const logoBuffer = await getImageData(data.logoUrl);
      if (logoBuffer.byteLength > 0) {
        logoImage = new ImageRun({ data: logoBuffer, transformation: { width: LOGO_SIZE_PX, height: LOGO_SIZE_PX } });
      }
    } catch (e) { console.warn("Logo load error", e); }
  }

  try {
    const ccLogoBuffer = await getImageData(CC_LOGO_URL);
    if (ccLogoBuffer.byteLength > 0) {
        // 88x31 pixels at 96 DPI is approx 66x23 points
        ccLogoImage = new ImageRun({ data: ccLogoBuffer, transformation: { width: 66, height: 23 } });
    }
  } catch (e) { console.warn("CC Logo load error", e); }

  // Header Table
  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: { style: BorderStyle.NONE, size: 0 }, bottom: { style: BorderStyle.NONE, size: 0 }, left: { style: BorderStyle.NONE, size: 0 }, right: { style: BorderStyle.NONE, size: 0 }, insideVertical: { style: BorderStyle.NONE, size: 0 }, insideHorizontal: { style: BorderStyle.NONE, size: 0 } },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 15, type: WidthType.PERCENTAGE },
            children: [ new Paragraph({ children: logoImage ? [logoImage] : [new TextRun({ text: "JBSH", bold: true, size: 48, font: FONT_FAMILY })], alignment: AlignmentType.LEFT }) ],
          }),
          new TableCell({
            width: { size: 85, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.TOP,
            children: [
              new Paragraph({ children: [ new TextRun({ text: "Journal of Biomedical Sciences and Health", bold: true, font: FONT_FAMILY, size: TITLE_SIZE, color: "0c4a6e" }) ], alignment: AlignmentType.RIGHT }),
              new Paragraph({ text: "e-ISSN: 3047-7182 | p-ISSN: 3062-6854", alignment: AlignmentType.RIGHT, spacing: { before: 0 }, style: "default" }),
              new Paragraph({ children: [ 
                  new TextRun({ text: "Available online at ", font: FONT_FAMILY }), 
                  new ExternalHyperlink({
                      children: [
                        new TextRun({ text: "ejournal.unkaha.ac.id/index.php/jbsh", underline: { type: "single", color: "0ea5e9" }, color: "0ea5e9", font: FONT_FAMILY })
                      ],
                      link: "https://ejournal.unkaha.ac.id/index.php/jbsh"
                  })
              ], alignment: AlignmentType.RIGHT, spacing: { before: 0 } }),
            ],
          }),
        ],
      }),
    ],
  });

  // Page 2 Header (Running Header)
  const runningHeader = new Header({
      children: [
          new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.SINGLE, size: 6 }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
              rows: [
                  new TableRow({
                      children: [
                          new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, children: [ new Paragraph({ children: [ new TextRun({ text: `${runningAuthor}.`, italics: true, size: 20, font: FONT_FAMILY }) ] }) ] }),
                          new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, children: [ new Paragraph({ alignment: AlignmentType.RIGHT, children: [ new TextRun({ text: journalInfoShort, size: 20, font: FONT_FAMILY }) ] }) ] })
                      ]
                  })
              ]
          }),
          new Paragraph({ spacing: { after: 240 } })
      ]
  });

  // Footer for Page 1
  const firstPageFooter = new Footer({
      children: [
         // Removed Open Access Text from Footer as it is now in the main body
         new Paragraph({ alignment: AlignmentType.CENTER, children: [ new TextRun({ text: "Journal of Biomedical Sciences and Health", bold: true, size: 18, font: FONT_FAMILY }) ], border: { top: { style: BorderStyle.SINGLE, size: 6 } }, spacing: { before: 100 } }),
         new Paragraph({ alignment: AlignmentType.CENTER, children: [ new TextRun({ text: `Copyright © ${year} The Author(s). Published by Universitas Karya Husada Semarang, Indonesia`, size: 16, font: FONT_FAMILY }) ] }),
         new Paragraph({ alignment: AlignmentType.RIGHT, children: [ new TextRun({ text: "1", size: 22, font: FONT_FAMILY }) ], spacing: { before: 60 } }),
      ]
  });

  // Footer for Page 2+
  const defaultFooter = new Footer({
      children: [
          new Paragraph({ alignment: AlignmentType.CENTER, children: [ new TextRun({ text: "Journal of Biomedical Sciences and Health", bold: true, size: 18, font: FONT_FAMILY }) ], border: { top: { style: BorderStyle.SINGLE, size: 6 } }, spacing: { before: 100 } }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [ new TextRun({ text: `Copyright © ${year} The Author(s). Published by Universitas Karya Husada Semarang, Indonesia`, size: 16, font: FONT_FAMILY }) ] }),
          new Paragraph({ alignment: AlignmentType.RIGHT, children: [ new SimpleField("PAGE") ], spacing: { before: 60 } }),
      ],
  });

  // Open Access Banner (Top Right - Visual Only)
  const openAccessBanner = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
    rows: [ new TableRow({ children: [ new TableCell({ shading: { fill: "0c4a6e", type: ShadingType.CLEAR, color: "auto" }, children: [ new Paragraph({ children: [
        new TextRun({ text: "OPEN ACCESS", color: "FFFFFF", bold: true, size: 20, font: FONT_FAMILY }),
        new TextRun({ text: "  ", size: 20 }),
        new TextRun({ text: "🔓", size: 20, color: "FFFFFF" })
    ], alignment: AlignmentType.RIGHT, spacing: { before: 40, after: 40 } }) ] }) ] }) ]
  });

  // ABSTRACT PRE-PROCESSING FOR BOLD KEYWORDS
  const abstractKeywords = ["Background", "Methods", "Results", "Conclusions", "Conclusion", "Objective", "Aim", "Introduction", "References"];
  let abstractText = data.abstract || "No abstract provided.";
  abstractKeywords.forEach(keyword => {
      // Bold keyword if it starts a sentence or section
      const regex = new RegExp(`\\b(${keyword})([:\\.]?)`, 'gi');
      abstractText = abstractText.replace(regex, "**$1$2**");
  });

  // Abstract Box (No dates inside)
  const abstractBox = new Table({
     width: { size: 100, type: WidthType.PERCENTAGE },
     borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.SINGLE, size: 48, color: "0c4a6e" }, right: { style: BorderStyle.NONE } }, // 48 is approx 6pt (1/8 inch * 8)
     rows: [ new TableRow({ children: [ new TableCell({ shading: { fill: "f8fafc", type: ShadingType.CLEAR, color: "auto" }, margins: { top: 200, bottom: 200, left: 240, right: 200 }, children: [ new Paragraph({ alignment: AlignmentType.CENTER, children: [ new TextRun({ text: "ABSTRACT", bold: true, color: "0c4a6e", size: 22, font: FONT_FAMILY }) ], spacing: { after: 120 } }), new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: parseTextToRuns(abstractText, false, 22), spacing: { after: 240 } }), new Paragraph({ alignment: AlignmentType.LEFT, children: [ new TextRun({ text: "Keywords: ", bold: true, font: FONT_FAMILY, color: "000000" }), new TextRun({ text: (data.keywords || []).join("; "), font: FONT_FAMILY }) ], spacing: { after: 120 } }) ] }) ] }) ]
  });

  // Separate Dates Paragraph
  const datesParagraph = new Paragraph({
      alignment: AlignmentType.CENTER,
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" } }, // Light gray underline
      spacing: { before: 120, after: 240 },
      children: [
          new TextRun({ text: "Received: ", bold: true, color: "0369a1", font: FONT_FAMILY, size: 18 }), // Brand 700
          new TextRun({ text: `${data.receivedDate || '...'} | `, font: FONT_FAMILY, size: 18 }),
          new TextRun({ text: "Revised: ", bold: true, color: "0369a1", font: FONT_FAMILY, size: 18 }),
          new TextRun({ text: `${data.revisedDate || '...'} | `, font: FONT_FAMILY, size: 18 }),
          new TextRun({ text: "Accepted: ", bold: true, color: "0369a1", font: FONT_FAMILY, size: 18 }),
          new TextRun({ text: `${data.acceptedDate || '...'} | `, font: FONT_FAMILY, size: 18 }),
          new TextRun({ text: "Published: ", bold: true, color: "0369a1", font: FONT_FAMILY, size: 18 }),
          new TextRun({ text: `${data.publishedDate || '...'}`, font: FONT_FAMILY, size: 18 }),
      ]
  });

  // Citation Table
  const citationTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE }, 
      alignment: AlignmentType.CENTER, 
      borders: { top: { style: BorderStyle.SINGLE, size: 1, color: "aaaaaa" }, bottom: { style: BorderStyle.SINGLE, size: 1, color: "aaaaaa" }, left: { style: BorderStyle.SINGLE, size: 36, color: "0c4a6e" }, right: { style: BorderStyle.SINGLE, size: 1, color: "aaaaaa" } },
      rows: [ new TableRow({ children: [ new TableCell({ shading: { fill: "f0f9ff", type: ShadingType.CLEAR, color: "auto" }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [ new Paragraph({ children: citationRuns }) ] }) ] }) ]
  });

  // Open Access Table (Below Citation)
  const openAccessTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      alignment: AlignmentType.CENTER,
      borders: { top: { style: BorderStyle.SINGLE, size: 1, color: "cccccc" }, bottom: { style: BorderStyle.SINGLE, size: 1, color: "cccccc" }, left: { style: BorderStyle.SINGLE, size: 1, color: "cccccc" }, right: { style: BorderStyle.SINGLE, size: 1, color: "cccccc" } },
      rows: [ new TableRow({ children: [ new TableCell({ shading: { fill: "f9fafb", type: ShadingType.CLEAR, color: "auto" }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [ 
          new Paragraph({ 
              children: [
                ...(ccLogoImage ? [ccLogoImage, new TextRun({ text: "   ", size: 18 })] : []),
                new TextRun({ text: "This work is licensed under a Creative Commons Attribution 4.0 International License (CC BY 4.0)", font: FONT_FAMILY, size: 18 })
              ],
              alignment: AlignmentType.CENTER
          }) 
      ] }) ] }) ]
  });

  // --- 11. ROBUST BODY CONTENT PARSING (State Machine) ---
  const contentChildren: (Paragraph | Table)[] = [];
  const lines = (data.content || "").split("\n");
  
  let paragraphBuffer: string[] = [];
  let tableBuffer: string[] = [];
  let inTable = false;
  let inReferences = false;

  // Function to flush the current text buffer into a Paragraph
  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return;
    
    const combinedText = paragraphBuffer.join(" ");
    const paraProps: any = {
        children: parseTextToRuns(combinedText),
        spacing: { after: 120 },
        alignment: AlignmentType.JUSTIFIED,
        indent: { firstLine: 567 } // 1. PARAGRAPH INDENTATION (1cm)
    };

    if (inReferences) {
        // Hanging indent for references (0.5cm approx 284 twips)
        // Justified alignment for references as requested
        paraProps.indent = { left: 284, hanging: 284 };
        paraProps.alignment = AlignmentType.JUSTIFIED;
    }

    contentChildren.push(new Paragraph(paraProps));
    paragraphBuffer = [];
  };

  const flushTable = () => {
      if (tableBuffer.length > 0) {
          const table = parseMarkdownTable(tableBuffer.join('\n'));
          if (table) contentChildren.push(table);
          tableBuffer = [];
      }
      inTable = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // SECTION HEADERS
    if (line.startsWith("#")) {
        flushParagraph();
        flushTable();

        if (line.toUpperCase().includes("REFERENCES") || line.toUpperCase().includes("DAFTAR PUSTAKA")) {
            inReferences = true;
        }

        const level = line.startsWith("### ") ? HeadingLevel.HEADING_3 : (line.startsWith("## ") ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_1);
        const text = line.replace(/#+\s*/, "");
        
        contentChildren.push(new Paragraph({ 
            text: text, 
            heading: level, 
            spacing: { before: 240, after: 120 },
            alignment: AlignmentType.LEFT // Headers should not be justified or indented
        }));
        continue;
    }

    // TABLE DETECTION
    if (line.includes('|') && line.length > 3) {
        flushParagraph();
        inTable = true;
        tableBuffer.push(line);
        continue;
    } else if (inTable) {
        flushTable(); // End of table block
    }

    // IMAGE DETECTION
    const imgMatch = line.match(/!\[(.*?)\]\((.*?)\)/);
    if (imgMatch) {
        flushParagraph(); // Ensure text before image is saved
        flushTable();

        const figId = imgMatch[2];
        const altText = imgMatch[1];
        const figure = (data.figures || []).find((f) => f.id === figId);

        if (figure) {
            try {
                const imgBuffer = await getImageData(figure.file);
                if (imgBuffer.byteLength > 0) {
                     // Add Image Paragraph
                     contentChildren.push(new Paragraph({ 
                         children: [ new ImageRun({ data: imgBuffer, transformation: { width: 300, height: 200 } }) ], 
                         alignment: AlignmentType.CENTER, 
                         spacing: { before: 200, after: 100 } 
                     }));
                     // Add Caption Paragraph
                     if (altText || figure.name) {
                         contentChildren.push(new Paragraph({ 
                             children: [new TextRun({ text: altText || figure.name, italics: true, bold: true, size: 18, font: FONT_FAMILY })], 
                             alignment: AlignmentType.CENTER, 
                             spacing: { after: 240 } 
                         }));
                     }
                }
            } catch (e) { 
                contentChildren.push(new Paragraph({ 
                    children: [new TextRun({ text: `[Image Error: ${figId}]`, italics: true, color: "FF0000", font: FONT_FAMILY })] 
                })); 
            }
        }
        continue;
    }

    // MATH / FORMULA DETECTION ($$ ... $$)
    if (line.trim().startsWith("$$") && line.trim().endsWith("$$")) {
        flushParagraph();
        flushTable();
        
        const formulaRaw = line.match(/\$\$(.*?)\$\$/)?.[1] || "";
        const readableMath = formatMathEquation(formulaRaw);
        
        const mathRuns = parseTextToRuns(readableMath);

        contentChildren.push(new Paragraph({
            children: mathRuns,
            alignment: AlignmentType.CENTER,
            spacing: { before: 120, after: 120 }
        }));
        continue;
    }

    // EMPTY LINES (Paragraph Break)
    if (line === "") {
        flushParagraph();
        continue;
    }

    // SPECIAL HANDLING FOR REFERENCES:
    // If we are in references, treat EVERY non-empty line as a new paragraph.
    // This prevents the "amburadul" merging of references into one giant block.
    if (inReferences) {
        flushParagraph(); // Flush any existing buffer
        paragraphBuffer.push(line);
        flushParagraph(); // Flush immediately
        continue;
    }

    // NORMAL TEXT ACCUMULATION
    paragraphBuffer.push(line);
  }
  
  // Final flush
  flushParagraph();
  flushTable();


  // --- 12. DOCUMENT ASSEMBLY ---
  const doc = new Document({
    styles: {
        default: {
            document: { run: { font: FONT_FAMILY, size: BODY_FONT_SIZE, color: "000000" }, paragraph: { spacing: { line: 240 } } },
            // Headers maintained at 12pt (size 24)
            heading1: { run: { font: FONT_FAMILY, bold: true, size: HEADER_FONT_SIZE, allCaps: true }, paragraph: { spacing: { before: 240, after: 120 } } },
            heading2: { run: { font: FONT_FAMILY, bold: true, size: HEADER_FONT_SIZE }, paragraph: { spacing: { before: 200, after: 100 } } },
            heading3: { run: { font: FONT_FAMILY, bold: true, size: HEADER_FONT_SIZE, italics: true }, paragraph: { spacing: { before: 200, after: 100 } } },
        },
    },
    sections: [
      {
        properties: { titlePage: true, page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
        headers: { default: runningHeader, first: new Header({ children: [new Paragraph({})] }) },
        footers: { default: defaultFooter, first: firstPageFooter }, 
        children: [
          headerTable,
          new Paragraph({ spacing: { before: 100 } }),
          openAccessBanner,
          new Paragraph({
            children: [
                new TextRun({ text: `Vol. ${data.volume || 'X'}, No. ${data.issue || 'X'}, ${year}`, bold: true, size: 20, font: FONT_FAMILY }),
                new TextRun({ text: "\t", font: FONT_FAMILY }),
                new TextRun({ text: "DOI: ", color: "0ea5e9", size: 20, font: FONT_FAMILY }),
                new ExternalHyperlink({
                    children: [
                      new TextRun({ text: data.doi || '...', color: "0ea5e9", size: 20, font: FONT_FAMILY })
                    ],
                    link: `https://doi.org/${data.doi || ''}`
                }),
                new TextRun({ text: "\t", font: FONT_FAMILY }),
                new TextRun({ text: `Pages ${data.pages || '...'}`, size: 20, font: FONT_FAMILY }),
            ],
            alignment: AlignmentType.LEFT,
            border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: "000000" } },
            spacing: { before: 100, after: 400 },
            tabStops: [ { type: TabStopType.CENTER, position: 4500 }, { type: TabStopType.RIGHT, position: 9000 } ]
          }),
          new Paragraph({ children: [new TextRun({ text: data.articleType || "Original Research Article", italics: true, font: FONT_FAMILY })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
          new Paragraph({ children: [new TextRun({ text: titleFormatted, bold: true, size: 28, font: FONT_FAMILY })], alignment: AlignmentType.CENTER, spacing: { after: 240 } }),
          new Paragraph({ children: authorRuns, alignment: AlignmentType.CENTER, spacing: { after: 120 } }),
          new Paragraph({ children: affRuns, alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
          new Paragraph({ children: [
              // Correspondence Section with Clickable Email
              ...correspondenceChildren
          ], alignment: AlignmentType.CENTER, border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" } }, spacing: { after: 200 } }),
          abstractBox,
          datesParagraph, // Added dates here
          new Paragraph({ spacing: { after: 240 } }),
          citationTable,
          new Paragraph({ spacing: { after: 120 } }),
          openAccessTable, // Added Open Access Table here
          new Paragraph({ spacing: { after: 240 } }),
        ],
      },
      {
        properties: { type: SectionType.CONTINUOUS, column: { count: 2, space: 708 }, page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
        children: contentChildren
      },
      {
        properties: { type: SectionType.CONTINUOUS },
        children: [new Paragraph({})]
      }
    ],
  });

  const blob = await Packer.toBlob(doc);
  const saveAs = (FileSaver as any).saveAs || (FileSaver as any).default?.saveAs || FileSaver;
  saveAs(blob, `${(data.title || "manuscript").substring(0, 30).replace(/[^a-z0-9]/gi, '_')}.docx`);
};