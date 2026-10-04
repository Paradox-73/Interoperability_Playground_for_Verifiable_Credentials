/**
 * Builds a Mermaid `sequenceDiagram` from the recorded exchanges of a run: one arrow per exchange, in
 * recording order, between the participants Playground, Issuer, Wallet, Verifier and Person.
 *
 * Nothing in the diagram is drawn from a template: an arrow exists only because an HTTP exchange was
 * recorded, so the picture is evidence of what happened on the wire.
 */
import type { RecordedExchange, RunConfig, RunEvent } from '@inji-playground/protocol';

export type Participant = 'Playground' | 'Issuer' | 'Wallet' | 'Verifier' | 'Person';

/** Left-to-right order: the playground drives, then the credential travels issuer -> wallet -> verifier. */
export const PARTICIPANTS: readonly Participant[] = ['Playground', 'Issuer', 'Wallet', 'Verifier', 'Person'];

export interface DiagramMessage {
  exchangeId: string;
  seq: number;
  from: Participant;
  to: Participant;
  /** Text on the arrow, before escaping for Mermaid. */
  label: string;
  /** No response, a network error, or an HTTP status of 400 or more. */
  failed: boolean;
}

export interface SequenceDiagram {
  /** Mermaid source text. */
  source: string;
  participants: Participant[];
  /** One entry per recorded exchange, in the order the arrows are drawn. */
  messages: DiagramMessage[];
}

export interface DiagramText {
  /** Accessible title (`accTitle`), for example "Run abc: ref-issuer to ref-wallet to ref-verifier". */
  title: string;
  /** Accessible description (`accDescr`): what the diagram shows, in one or two sentences. */
  description: string;
  /** Display names of the participants, for example "Issuer (inji-certify)". */
  participantNames?: Partial<Record<Participant, string>>;
}

/**
 * The participant a recorded `from` / `to` value stands for. Role ids of the run configuration are exact;
 * other names (service names seen by the proxy, such as `mimoto` or `verify-service`) are matched by the
 * words they contain, and anything unknown is drawn on the playground's lifeline.
 */
export function participantOf(id: string, config?: RunConfig): Participant {
  if (config) {
    if (id === config.issuer) return 'Issuer';
    if (id === config.wallet) return 'Wallet';
    if (id === config.verifier) return 'Verifier';
  }
  const name = id.toLowerCase();
  if (name === 'person' || name.startsWith('person')) return 'Person';
  if (/issuer|certify|esignet|authz|auth-server/.test(name)) return 'Issuer';
  if (/wallet|mimoto|inji-web|phone|mobile/.test(name)) return 'Wallet';
  if (/verif/.test(name)) return 'Verifier';
  return 'Playground';
}

/** Characters Mermaid would read as syntax inside message text are written as Mermaid entity codes. */
export function escapeMermaidText(text: string): string {
  // One pass, so the `#` and `;` of an entity already written are not escaped again.
  return text
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .replace(/[#;<>]|%%/g, (char) => MERMAID_ENTITIES[char] ?? char)
    .trim();
}

const MERMAID_ENTITIES: Record<string, string> = {
  '#': '#35;',
  ';': '#59;',
  '<': '#lt;',
  '>': '#gt;',
  '%%': '#37;#37;',
};

const MAX_PATH = 40;

function pathOf(url: string): string {
  let path = url;
  try {
    const parsed = new URL(url);
    path = parsed.protocol.startsWith('http') ? parsed.pathname : `${parsed.protocol}//${parsed.host}`;
  } catch {
    // Keep the text as recorded.
  }
  return path.length > MAX_PATH ? `…${path.slice(path.length - MAX_PATH + 1)}` : path;
}

export function isFailed(exchange: RecordedExchange): boolean {
  return exchange.error !== undefined || !exchange.response || exchange.response.status >= 400;
}

/** "3. POST /token → 200", or "→ error" when no response arrived. */
export function messageLabel(exchange: RecordedExchange): string {
  const outcome = exchange.response ? String(exchange.response.status) : 'error';
  return `${exchange.seq}. ${exchange.request.method} ${pathOf(exchange.request.url)} → ${outcome}`;
}

/**
 * The diagram of a run from its events (or a prefix of them, in playback). Exchanges become arrows;
 * person actions become notes on the Person lifeline at the point in the run where they happened.
 */
export function buildSequenceDiagram(events: readonly RunEvent[], text: DiagramText): SequenceDiagram {
  let config: RunConfig | undefined;
  const messages: DiagramMessage[] = [];
  // Body lines in event order: arrows and notes interleaved as they happened.
  const body: Array<{ note: string } | { message: DiagramMessage }> = [];
  for (const event of events) {
    if (event.type === 'run.started') config = event.config;
    else if (event.type === 'person.action-needed') body.push({ note: event.action.title });
    else if (event.type === 'exchange') {
      const { exchange } = event;
      const message: DiagramMessage = {
        exchangeId: exchange.id,
        seq: exchange.seq,
        from: participantOf(exchange.from, config),
        to: participantOf(exchange.to, config),
        label: messageLabel(exchange),
        failed: isFailed(exchange),
      };
      messages.push(message);
      body.push({ message });
    }
  }

  // The four main lifelines are always drawn, so arrows do not jump sideways while a run is recorded;
  // Person appears only when the run needed one.
  const used = new Set<Participant>(['Playground', 'Issuer', 'Wallet', 'Verifier']);
  for (const message of messages) used.add(message.from).add(message.to);
  if (body.some((line) => 'note' in line)) used.add('Person');
  const participants = PARTICIPANTS.filter((participant) => used.has(participant));

  const lines = [
    'sequenceDiagram',
    `  accTitle: ${escapeMermaidText(text.title)}`,
    `  accDescr: ${escapeMermaidText(text.description)}`,
    ...participants.map((participant) => {
      const name = text.participantNames?.[participant];
      const kind = participant === 'Person' ? 'actor' : 'participant';
      return name ? `  ${kind} ${participant} as ${escapeMermaidText(name)}` : `  ${kind} ${participant}`;
    }),
    ...body.map((line) =>
      'note' in line
        ? `  Note over Person: ${escapeMermaidText(line.note)}`
        : `  ${line.message.from}${line.message.failed ? '-x' : '->>'}${line.message.to}: ${escapeMermaidText(line.message.label)}`,
    ),
  ];
  return { source: `${lines.join('\n')}\n`, participants, messages };
}
