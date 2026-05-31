import { useState } from "react";
import { ChevronDown, ChevronUp, Code2, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n";

const EXAMPLE_PART = `[
  {
    "type": "block",
    "id": "minecraft:stone",
    "coords": [[0,0,0],[1,0,0],[2,0,0]]
  },
  {
    "type": "block",
    "id": "minecraft:oak_planks",
    "coords": [[0,1,0],[1,1,0]]
  },
  {
    "type": "blockEntity",
    "blocks": [
      { "pos": [0,2,0], "values": { "Items": [...] } }
    ]
  },
  {
    "type": "entity",
    "entities": [
      { "egg": "minecraft:cow_spawn_egg", "pos": [1.5,1.0,2.5] }
    ]
  }
]`;

export function ApiDocs() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Card className="border-border/40 bg-card/30 overflow-hidden">
      <button
        className="w-full text-left"
        onClick={() => setOpen((o) => !o)}
        data-testid="btn-toggle-docs"
      >
        <CardHeader className="py-4 px-6 bg-secondary/20 hover:bg-secondary/30 transition-colors">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Code2 className="w-4 h-4 text-primary" />
              {t.docsTitle}
            </CardTitle>
            {open ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </CardHeader>
      </button>

      {open && (
        <CardContent className="px-6 py-5 space-y-6 border-t border-border/40">

          {/* Format section */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <span className="w-5 h-5 rounded bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">1</span>
              {t.docsFormatTitle}
            </h3>
            <p className="text-sm text-muted-foreground">{t.docsFormatDesc}</p>
            <ul className="space-y-1.5 text-sm">
              <TypeBadge color="blue" label="block" desc={t.docsTypeBlock} />
              <TypeBadge color="amber" label="blockEntity" desc={t.docsTypeBlockEntity} />
              <TypeBadge color="rose" label="entity" desc={t.docsTypeEntity} />
            </ul>
            <div className="rounded-md overflow-hidden border border-border/40 mt-3">
              <div className="bg-[#0d0d0d] px-3 py-1.5 text-xs text-muted-foreground/70 border-b border-border/30 font-mono">
                GET /api/part/:key/1
              </div>
              <pre className="bg-[#0d0d0d] text-[#a6accd] text-xs font-mono p-4 overflow-x-auto leading-relaxed">
                {EXAMPLE_PART}
              </pre>
            </div>
          </section>

          {/* API section */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <span className="w-5 h-5 rounded bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">2</span>
              {t.docsApiTitle}
            </h3>
            <p className="text-sm text-muted-foreground">{t.docsApiDesc}</p>
            <div className="rounded-md border border-border/40 overflow-hidden divide-y divide-border/40">
              <ApiEndpoint method="GET" path="/api/info/:key" desc={t.docsApiInfo}
                example={`{ "key": "abc-123", "name": "MyBuild", "partCount": 5 }`} />
              <ApiEndpoint method="GET" path="/api/part/:key/:number" desc={t.docsApiPart}
                example={`{ "key": "abc-123", "number": 1, "total": 5, "data": "[...]" }`} />
            </div>
          </section>

        </CardContent>
      )}
    </Card>
  );
}

function TypeBadge({ color, label, desc }: { color: "blue" | "amber" | "rose"; label: string; desc: string }) {
  const colors = {
    blue:  "bg-blue-500/10 text-blue-400 border-blue-500/20",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    rose:  "bg-rose-500/10 text-rose-400 border-rose-500/20",
  };
  return (
    <li className="flex items-start gap-3">
      <span className={`shrink-0 mt-0.5 text-xs font-mono px-2 py-0.5 rounded border ${colors[color]}`}>{label}</span>
      <span className="text-muted-foreground text-sm">{desc}</span>
    </li>
  );
}

function ApiEndpoint({ method, path, desc, example }: { method: string; path: string; desc: string; example: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(example);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div className="bg-card/40 p-4 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded border border-emerald-400/20">{method}</span>
        <code className="text-sm font-mono text-foreground">{path}</code>
        <Zap className="w-3 h-3 text-primary ml-auto shrink-0" />
      </div>
      <p className="text-xs text-muted-foreground">{desc}</p>
      <div className="relative rounded bg-[#0d0d0d] border border-border/30 overflow-hidden">
        <pre className="text-xs font-mono text-[#a6accd] p-3 overflow-x-auto">{example}</pre>
        <button
          onClick={copy}
          className="absolute top-2 right-2 text-xs text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded bg-secondary/50 hover:bg-secondary"
        >
          {copied ? "✓" : "copy"}
        </button>
      </div>
    </div>
  );
}
