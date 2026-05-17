'use client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Apple-style markdown renderer for chat bubbles. Keeps the visual language
// of the surrounding chat (compact, ink-on-white), supports GFM (tables, task
// lists, autolinks). No syntax highlighting — minimal bundle, plenty for our
// chat use case.

type Props = { content: string; className?: string }

const linkProps = { target: '_blank', rel: 'noopener noreferrer' as const }

export default function MarkdownMessage({ content, className }: Props) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ node, ...props }) => <p className="mb-2 last:mb-0 whitespace-pre-wrap break-words" {...props} />,
          strong: ({ node, ...props }) => <strong className="font-semibold" {...props} />,
          em: ({ node, ...props }) => <em className="italic" {...props} />,
          ul: ({ node, ...props }) => (
            <ul className="my-2 list-disc pl-5 space-y-1 marker:text-current/60" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="my-2 list-decimal pl-5 space-y-1 marker:text-current/60" {...props} />
          ),
          li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
          h1: ({ node, ...props }) => <h1 className="mb-2 mt-3 text-[17px] font-semibold first:mt-0" {...props} />,
          h2: ({ node, ...props }) => <h2 className="mb-2 mt-3 text-[16px] font-semibold first:mt-0" {...props} />,
          h3: ({ node, ...props }) => <h3 className="mb-1.5 mt-3 text-[15px] font-semibold first:mt-0" {...props} />,
          h4: ({ node, ...props }) => <h4 className="mb-1.5 mt-2 text-[14px] font-semibold first:mt-0" {...props} />,
          a: ({ node, ...props }) => (
            <a className="underline underline-offset-2 hover:opacity-80" {...linkProps} {...props} />
          ),
          blockquote: ({ node, ...props }) => (
            <blockquote
              className="my-2 border-l-2 border-current/30 pl-3 italic opacity-90"
              {...props}
            />
          ),
          code: ({ node, className: cn, children, ...props }: any) => {
            const isBlock = /language-/.test(cn || '') || String(children).includes('\n')
            if (isBlock) {
              return (
                <pre className="my-2 overflow-x-auto rounded-lg bg-black/10 p-3 text-[12.5px] leading-relaxed">
                  <code className={cn} {...props}>
                    {children}
                  </code>
                </pre>
              )
            }
            return (
              <code
                className="rounded bg-black/10 px-1.5 py-0.5 text-[0.92em] font-mono"
                {...props}
              >
                {children}
              </code>
            )
          },
          pre: ({ node, children }) => <>{children}</>,
          hr: () => <hr className="my-3 border-current/15" />,
          table: ({ node, ...props }) => (
            <div className="my-2 overflow-x-auto">
              <table className="min-w-full border-collapse text-[13px]" {...props} />
            </div>
          ),
          th: ({ node, ...props }) => (
            <th className="border-b border-current/20 px-2 py-1 text-left font-semibold" {...props} />
          ),
          td: ({ node, ...props }) => (
            <td className="border-b border-current/10 px-2 py-1 align-top" {...props} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
