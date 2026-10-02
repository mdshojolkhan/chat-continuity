import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

export async function copyChatText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const code = (Array.isArray(children) ? children : [children])
    .map((child) => {
      if (typeof child === 'string') return child;
      if (typeof child === 'object' && child !== null && 'props' in child) {
        const props = child.props as { children?: React.ReactNode };
        return String(props.children ?? '');
      }
      return '';
    })
    .join('');

  return (
    <div className="my-2 min-w-0 overflow-hidden rounded-md border border-[var(--ws-line)] bg-[var(--ws-base)]">
      <div className="flex justify-end border-b border-[var(--ws-line)] px-2 py-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-9 gap-1.5 px-2 text-[var(--ws-muted)]"
          onClick={async () => {
            if (await copyChatText(code)) {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            }
          }}
          aria-label={copied ? 'Code copied' : 'Copy code'}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? 'Copied' : 'Copy code'}
        </Button>
      </div>
      <pre className="max-w-full overflow-x-auto p-3 font-mono text-xs leading-relaxed">{children}</pre>
    </div>
  );
}

export function ChatMessageContent({ content }: { content: string }) {
  return (
    <div className="ws-markdown min-w-0 break-words [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--ws-line)] [&_blockquote]:pl-3 [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
          table: ({ children }) => <div className="my-2 max-w-full overflow-x-auto"><table className="w-full border-collapse text-left [&_td]:border [&_td]:border-[var(--ws-line)] [&_td]:p-2 [&_th]:border [&_th]:border-[var(--ws-line)] [&_th]:p-2">{children}</table></div>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}