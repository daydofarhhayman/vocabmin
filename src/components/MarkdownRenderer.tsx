import React, { useMemo } from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  isUser?: boolean;
}

// Inline token types
type InlineToken =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string }
  | { type: 'boldItalic'; text: string }
  | { type: 'code'; text: string }
  | { type: 'strike'; text: string }
  | { type: 'link'; text: string; url: string };

// Helper: parse inline markdown (bold, italic, code, strike, links)
function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let remaining = text;

  // Regex matching inline formatting
  // 1: bold-italic (*** or ___)
  // 2: bold (** or __)
  // 3: italic (* or _)
  // 4: inline code (`...`)
  // 5: strike (~~...~~)
  // 6: link ([text](url))
  const inlineRegex =
    /(?:\*\*\*(.+?)\*\*\*|___(.+?)___|\*\*(.+?)\*\*|__(.+?)__|(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)|(?<!_)_(?!_)(.+?)(?<!_)_(?!_)|`([^`]+)`|~~(.+?)~~|\[([^\]]+)\]\(([^)]+)\))/;

  while (remaining) {
    const match = remaining.match(inlineRegex);
    if (!match || match.index === undefined) {
      if (remaining) tokens.push({ type: 'text', text: remaining });
      break;
    }

    if (match.index > 0) {
      tokens.push({ type: 'text', text: remaining.slice(0, match.index) });
    }

    if (match[1] || match[2]) {
      tokens.push({ type: 'boldItalic', text: match[1] || match[2] });
    } else if (match[3] || match[4]) {
      tokens.push({ type: 'bold', text: match[3] || match[4] });
    } else if (match[5] || match[6]) {
      tokens.push({ type: 'italic', text: match[5] || match[6] });
    } else if (match[7]) {
      tokens.push({ type: 'code', text: match[7] });
    } else if (match[8]) {
      tokens.push({ type: 'strike', text: match[8] });
    } else if (match[9] && match[10]) {
      tokens.push({ type: 'link', text: match[9], url: match[10] });
    }

    remaining = remaining.slice(match.index + match[0].length);
  }

  return tokens;
}

// Render inline tokens
function renderInlineTokens(tokens: InlineToken[], isUser?: boolean): React.ReactNode {
  return tokens.map((token, idx) => {
    switch (token.type) {
      case 'bold':
        return (
          <strong
            key={idx}
            className={`font-semibold ${
              isUser
                ? 'text-white'
                : 'text-slate-900 dark:text-slate-50'
            }`}
          >
            {token.text}
          </strong>
        );
      case 'boldItalic':
        return (
          <strong
            key={idx}
            className={`font-semibold italic ${
              isUser ? 'text-white' : 'text-slate-900 dark:text-slate-50'
            }`}
          >
            {token.text}
          </strong>
        );
      case 'italic':
        return (
          <em key={idx} className="italic opacity-90">
            {token.text}
          </em>
        );
      case 'code':
        return (
          <code
            key={idx}
            className={`px-1.5 py-0.5 mx-0.5 rounded font-mono text-[11px] font-medium ${
              isUser
                ? 'bg-white/20 text-white border border-white/30'
                : 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60'
            }`}
          >
            {token.text}
          </code>
        );
      case 'strike':
        return (
          <del key={idx} className="line-through opacity-70">
            {token.text}
          </del>
        );
      case 'link':
        return (
          <a
            key={idx}
            href={token.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`underline underline-offset-2 ${
              isUser
                ? 'text-white hover:text-indigo-100'
                : 'text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300'
            }`}
          >
            {token.text}
          </a>
        );
      case 'text':
      default:
        return <React.Fragment key={idx}>{token.text}</React.Fragment>;
    }
  });
}

// Block structure
type BlockNode =
  | { type: 'header'; level: number; text: string }
  | { type: 'codeblock'; language: string; code: string }
  | { type: 'blockquote'; lines: string[] }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'hr' }
  | { type: 'paragraph'; text: string };

function parseMarkdownBlocks(rawMarkdown: string): BlockNode[] {
  const blocks: BlockNode[] = [];
  const lines = rawMarkdown.replace(/\r\n/g, '\n').split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // 1. Empty lines
    if (!trimmed) {
      i++;
      continue;
    }

    // 2. Fenced Code Block
    if (trimmed.startsWith('```')) {
      const language = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      blocks.push({
        type: 'codeblock',
        language,
        code: codeLines.join('\n')
      });
      continue;
    }

    // 3. Horizontal Rule
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    // 4. Headers
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      blocks.push({
        type: 'header',
        level: headerMatch[1].length,
        text: headerMatch[2].trim()
      });
      i++;
      continue;
    }

    // 5. Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({
        type: 'blockquote',
        lines: quoteLines
      });
      continue;
    }

    // 6. Markdown Table
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && i + 1 < lines.length && lines[i + 1].includes('---')) {
      const parseCells = (rowStr: string) =>
        rowStr
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim());

      const headers = parseCells(line);
      i += 2; // skip header and delimiter row
      const rows: string[][] = [];

      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        rows.push(parseCells(lines[i]));
        i++;
      }

      blocks.push({
        type: 'table',
        headers,
        rows
      });
      continue;
    }

    // 7. Unordered List (-, *, +)
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*+]\s+/, ''));
        i++;
      }
      blocks.push({
        type: 'ul',
        items
      });
      continue;
    }

    // 8. Ordered List (1. 2. 3.)
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      blocks.push({
        type: 'ol',
        items
      });
      continue;
    }

    // 9. Paragraph
    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('>') &&
      !/^[-*+]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !/^(\*{3,}|-{3,}|_{3,})$/.test(lines[i].trim()) &&
      !(lines[i].trim().startsWith('|') && i + 1 < lines.length && lines[i + 1].includes('---'))
    ) {
      paragraphLines.push(lines[i]);
      i++;
    }

    if (paragraphLines.length > 0) {
      blocks.push({
        type: 'paragraph',
        text: paragraphLines.join('\n')
      });
    }
  }

  return blocks;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className = '',
  isUser = false
}) => {
  const blocks = useMemo(() => parseMarkdownBlocks(content || ''), [content]);

  return (
    <div className={`space-y-2 leading-relaxed ${className}`}>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case 'header': {
            const tokens = parseInline(block.text);
            const contentNode = renderInlineTokens(tokens, isUser);
            switch (block.level) {
              case 1:
                return (
                  <h1
                    key={idx}
                    className={`font-bold text-sm sm:text-base mt-2.5 mb-1 pb-1 border-b ${
                      isUser
                        ? 'text-white border-white/20'
                        : 'text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700/80'
                    }`}
                  >
                    {contentNode}
                  </h1>
                );
              case 2:
                return (
                  <h2
                    key={idx}
                    className={`font-bold text-xs sm:text-sm mt-2 mb-1 ${
                      isUser ? 'text-white' : 'text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    {contentNode}
                  </h2>
                );
              case 3:
              default:
                return (
                  <h3
                    key={idx}
                    className={`font-semibold text-xs mt-1.5 mb-0.5 ${
                      isUser ? 'text-white' : 'text-indigo-900 dark:text-indigo-300'
                    }`}
                  >
                    {contentNode}
                  </h3>
                );
            }
          }

          case 'codeblock':
            return (
              <div
                key={idx}
                className="my-2 rounded-xl overflow-hidden bg-slate-900 text-slate-200 border border-slate-800 text-xs shadow-xs"
              >
                {block.language && (
                  <div className="px-3 py-1 bg-slate-800/80 text-[10px] uppercase font-mono text-slate-400 border-b border-slate-700/50 flex justify-between items-center">
                    <span>{block.language}</span>
                  </div>
                )}
                <pre className="p-3 overflow-x-auto font-mono text-[11px] leading-relaxed">
                  <code>{block.code}</code>
                </pre>
              </div>
            );

          case 'blockquote':
            return (
              <blockquote
                key={idx}
                className={`my-1.5 pl-3 py-1 border-l-3 rounded-r-lg text-xs italic ${
                  isUser
                    ? 'border-white/60 bg-white/10 text-white/95'
                    : 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30 text-slate-700 dark:text-slate-300'
                }`}
              >
                {block.lines.map((qLine, qIdx) => (
                  <div key={qIdx}>{renderInlineTokens(parseInline(qLine), isUser)}</div>
                ))}
              </blockquote>
            );

          case 'ul':
            return (
              <ul
                key={idx}
                className={`space-y-1 my-1.5 pl-4 text-xs list-disc marker:text-indigo-500 dark:marker:text-indigo-400 ${
                  isUser ? 'marker:text-white/80' : ''
                }`}
              >
                {block.items.map((item, itemIdx) => (
                  <li key={itemIdx} className="leading-relaxed">
                    {renderInlineTokens(parseInline(item), isUser)}
                  </li>
                ))}
              </ul>
            );

          case 'ol':
            return (
              <ol
                key={idx}
                className={`space-y-1 my-1.5 pl-4 text-xs list-decimal marker:font-semibold ${
                  isUser
                    ? 'marker:text-white'
                    : 'marker:text-indigo-600 dark:marker:text-indigo-400'
                }`}
              >
                {block.items.map((item, itemIdx) => (
                  <li key={itemIdx} className="leading-relaxed">
                    {renderInlineTokens(parseInline(item), isUser)}
                  </li>
                ))}
              </ol>
            );

          case 'table':
            return (
              <div key={idx} className="my-2 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200">
                      {block.headers.map((h, hIdx) => (
                        <th key={hIdx} className="p-2 border-b border-slate-200 dark:border-slate-700 font-semibold">
                          {renderInlineTokens(parseInline(h), isUser)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        className="even:bg-slate-50/50 dark:even:bg-slate-900/30 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            className="p-2 border-t border-slate-200/60 dark:border-slate-700/60 text-slate-700 dark:text-slate-300"
                          >
                            {renderInlineTokens(parseInline(cell), isUser)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );

          case 'hr':
            return (
              <hr
                key={idx}
                className={`my-2.5 border-t ${
                  isUser ? 'border-white/20' : 'border-slate-200 dark:border-slate-700/80'
                }`}
              />
            );

          case 'paragraph': {
            // Split by single line breaks so we can render line breaks properly
            const lines = block.text.split('\n');
            return (
              <p key={idx} className="my-1.5 leading-relaxed text-xs">
                {lines.map((l, lIdx) => (
                  <React.Fragment key={lIdx}>
                    {renderInlineTokens(parseInline(l), isUser)}
                    {lIdx < lines.length - 1 && <br />}
                  </React.Fragment>
                ))}
              </p>
            );
          }

          default:
            return null;
        }
      })}
    </div>
  );
};
