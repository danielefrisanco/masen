/**
 * The way back, from somebody who made a map to whoever built the tool.
 *
 * Everything else in this project is one-way. The library emits a document, the
 * tool emits a picture, and a reader who wanted something that is not here has
 * had nowhere to say so — which means every "is this worth building" question
 * the plan has asked has been answered by judgement, because there was no other
 * way to answer it. Roads are the sharpest case: 29 MB of data whose gate is
 * written as *the tool is where anyone will first ask for a road, and asking is
 * the evidence*, in a tool where nobody could ask.
 *
 * **The map travels with the message, and that is the whole point of putting
 * this here rather than on a contact page.** 09c made the address bar the
 * complete state of a map; this is the second thing that property pays for.
 * Somebody reporting that sea names look wrong in the Aegean sends the Aegean,
 * and it reopens exactly as they had it — not a description of it, which is the
 * difference between a bug report and a reproduction.
 *
 * **A form rather than a GitHub issue**, decided against the obvious option: an
 * issue asks the reader for an account before they are allowed to say anything,
 * and the reader this tool was built for — a reporter on deadline — does not
 * have one and will not make one. It also puts their words on a public page,
 * which is wrong for somebody who only wants to say the thing is broken.
 *
 * **The access key below is public and has to be**, because the browser is what
 * does the sending. Web3Forms says so themselves and puts it in a plain hidden
 * input in their own examples. It is not a credential: everything it can do is
 * send an email to the one address it was issued for. It cannot read what was
 * sent before, reach an account, or deliver anywhere else. An `.env` file would
 * not change any of that — Vite inlines `VITE_` variables into the bundle at
 * build time, so it would ship in the JavaScript regardless, and the only thing
 * gained would be the feeling of a secret plus a variable to configure in CI.
 *
 * What the key does expose is an **abuse handle**: anyone can lift it and post
 * to it from their own script, without ever loading this page. The honeypot
 * below does nothing about that — it only catches bots that crawl and submit
 * the form itself — and it is worth being clear about which of the two problems
 * each guard actually solves. The ceiling on the damage is a dead channel until
 * the month turns over, because a free tier refuses rather than bills.
 */

/**
 * Issued for the address the messages go to, and valid for nothing else.
 * See the note above on why this is in the source rather than in an env file.
 */
const ACCESS_KEY = "40135e88-5f68-445d-9389-1109d3ba3adb";

const ENDPOINT = "https://api.web3forms.com/submit";

/**
 * The longest message the form will send.
 *
 * Not a guess about what anyone needs to say — 4000 characters is several
 * screens of prose — but a ceiling, so a stuck key or a paste of an entire
 * document does not become the thing that exhausts the month's quota.
 */
const LIMIT = 4000;

/**
 * How long to wait between messages from one browser, in milliseconds.
 *
 * This stops a double-click sending twice and a frustrated reader sending the
 * same paragraph five times; it does not stop anybody determined, because a
 * limit held in the sender's own storage never could. That is the honest
 * description of it, and the reason it is a courtesy rather than a defence.
 */
const COOLDOWN = 30_000;

const SENT_AT = "masen:v1:feedback";

function lastSent(): number {
  try {
    return Number(window.localStorage.getItem(SENT_AT) ?? 0);
  } catch {
    // Storage throws outright in a browser set to block site data. A reader
    // whose browser refuses to remember is not a reader who should be refused a
    // message, so the cooldown simply does not apply to them.
    return 0;
  }
}

function markSent(): void {
  try {
    window.localStorage.setItem(SENT_AT, String(Date.now()));
  } catch {
    // As above.
  }
}

interface Parts {
  readonly dialog: HTMLDialogElement;
  readonly form: HTMLFormElement;
  readonly message: HTMLTextAreaElement;
  readonly email: HTMLInputElement;
  readonly botcheck: HTMLInputElement;
  readonly send: HTMLButtonElement;
  readonly close: HTMLButtonElement;
  readonly say: HTMLParagraphElement;
  readonly link: HTMLElement;
}

function build(): Parts {
  const dialog = document.createElement("dialog");
  dialog.className = "feedback";

  const form = document.createElement("form");
  // `method="dialog"` is deliberately *not* used: this form is sent by fetch, so
  // the reader stays on the page with the map they were describing still in
  // front of them, and the answer appears where they asked rather than on a
  // thank-you page somewhere else.
  form.className = "feedback-form";

  const title = document.createElement("h2");
  title.textContent = "What was missing?";

  const blurb = document.createElement("p");
  blurb.className = "feedback-blurb";
  blurb.textContent =
    "Something you wanted and could not find, something drawn wrong, or something that would have helped. It goes straight to the person who builds this — nowhere public.";

  const messageLabel = document.createElement("label");
  messageLabel.className = "field";
  const messageText = document.createElement("span");
  messageText.className = "field-label";
  messageText.textContent = "Your message";
  const message = document.createElement("textarea");
  message.name = "message";
  message.required = true;
  message.rows = 6;
  message.maxLength = LIMIT;
  messageLabel.append(messageText, message);

  const emailLabel = document.createElement("label");
  emailLabel.className = "field";
  const emailText = document.createElement("span");
  emailText.className = "field-label";
  emailText.textContent = "Your email — optional, only so a reply is possible";
  const email = document.createElement("input");
  email.name = "email";
  email.type = "email";
  email.autocomplete = "email";
  emailLabel.append(emailText, email);

  /**
   * The honeypot. Hidden from anyone using the page and irresistible to a bot
   * filling every field it finds; Web3Forms discards a submission that carries
   * it. `tabindex` and `aria-hidden` matter as much as `display: none` here —
   * a field a screen reader announces is not hidden, it is just invisible.
   */
  const botcheck = document.createElement("input");
  botcheck.type = "checkbox";
  botcheck.name = "botcheck";
  botcheck.className = "feedback-bot";
  botcheck.tabIndex = -1;
  botcheck.setAttribute("aria-hidden", "true");
  botcheck.autocomplete = "off";

  const link = document.createElement("p");
  link.className = "feedback-link";

  const say = document.createElement("p");
  say.className = "feedback-say";
  say.setAttribute("role", "status");

  const actions = document.createElement("div");
  actions.className = "feedback-actions";
  const send = document.createElement("button");
  send.type = "submit";
  send.className = "action";
  send.textContent = "Send";
  /**
   * One button that changes its word rather than two that swap places.
   * Before sending it is the way out of a message you thought better of; after
   * sending there is nothing left to abandon, and it is the way out of a dialog
   * whose work is done. Same position both times, so nobody has to look for it.
   */
  const close = document.createElement("button");
  close.type = "button";
  close.className = "action";
  close.textContent = "Cancel";
  close.addEventListener("click", () => dialog.close());
  actions.append(send, close);

  // The answer sits *above* the buttons, not below them. Under the row it is
  // the last thing on the dialog and the easiest thing to miss — which is
  // exactly what happened the first time this was used.
  form.append(title, blurb, messageLabel, emailLabel, botcheck, link, say, actions);
  dialog.append(form);
  document.body.append(dialog);

  return { dialog, form, message, email, botcheck, send, close, say, link };
}

/**
 * Wire the button to the form, and the form to the map it is about.
 *
 * `mapLink` is a function rather than a string because the map changes under
 * this: somebody opens the dialog, thinks better of it, moves the region, and
 * comes back. Reading the link at the moment of sending is what keeps the
 * attached map the one they are actually looking at.
 */
export function mountFeedback(
  button: HTMLButtonElement,
  mapLink: () => string,
  onSent?: (text: string) => void,
): void {
  let parts: Parts | null = null;

  function report(text: string, state: "" | "error" | "sent" = ""): void {
    if (parts === null) return;
    parts.say.textContent = text;
    parts.say.classList.toggle("is-error", state === "error");
    parts.say.classList.toggle("is-sent", state === "sent");
  }

  /**
   * Back to a dialog that can take a message.
   *
   * Run on opening rather than on closing, because a dialog is dismissed in
   * ways this code never hears about — Escape, the backdrop, the browser — and
   * a reset that only happens on the paths we control is a reset that
   * eventually does not happen.
   */
  function ready(current: Parts): void {
    current.form.reset();
    current.form.classList.remove("is-sent");
    current.send.hidden = false;
    current.send.disabled = false;
    current.close.textContent = "Cancel";
    report("");
    current.link.textContent = `The map you are looking at is attached as a link: ${mapLink()}`;
  }

  button.addEventListener("click", () => {
    parts ??= build();
    ready(parts);
    parts.dialog.showModal();
    parts.message.focus();
  });

  document.addEventListener("submit", (event) => {
    if (parts === null || event.target !== parts.form) return;
    event.preventDefault();
    void send(parts);
  });

  async function send(current: Parts): Promise<void> {
    const text = current.message.value.trim();
    if (text === "") {
      report("There is nothing in the message yet.", "error");
      current.message.focus();
      return;
    }

    const since = Date.now() - lastSent();
    if (since < COOLDOWN) {
      report(`Just a moment — one message every ${Math.round(COOLDOWN / 1000)} seconds.`, "error");
      return;
    }

    const address = current.email.value.trim();

    current.send.disabled = true;
    report("Sending…");
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          access_key: ACCESS_KEY,
          subject: "masen — feedback from the tool",
          // Sent only when there is one. An empty string in this field is not
          // "no reply address" to Web3Forms, it is an invalid one, and the
          // whole message is refused for it.
          ...(address === "" ? {} : { email: address }),
          message: text,
          // A field of its own rather than glued onto the message, so it
          // arrives as its own line and stays clickable.
          map: mapLink(),
          botcheck: current.botcheck.checked,
        }),
      });
      const body: unknown = await response.json().catch(() => null);
      const ok =
        response.ok &&
        typeof body === "object" &&
        body !== null &&
        (body as { success?: unknown }).success === true;

      if (!ok) {
        const detail =
          typeof body === "object" && body !== null && typeof (body as { message?: unknown }).message === "string"
            ? (body as { message: string }).message
            : `the server answered ${response.status}`;
        report(`That did not send — ${detail}. Nothing was lost; try again in a moment.`, "error");
        current.send.disabled = false;
        return;
      }

      markSent();
      /**
       * The dialog stops being a form and becomes a receipt. The fields go —
       * leaving an empty box under a success message invites somebody to
       * wonder whether it really went, and to send it twice — and *Send* goes
       * with them, because there is nothing left to send.
       *
       * It does not close itself. A dialog that vanishes on success takes the
       * confirmation with it and leaves the reader looking at the map they
       * were looking at before, with no evidence anything happened.
       */
      current.form.classList.add("is-sent");
      current.send.hidden = true;
      current.close.textContent = "Close";
      report("Sent, and thank you — it arrived with the link to your map.", "sent");
      // A trace that outlives the dialog, so closing it does not erase the only
      // thing that said the message went.
      onSent?.("Your message was sent. Thank you.");
    } catch {
      // A network failure, or a browser extension refusing the request. Both
      // look identical from here and neither is the reader's fault, so the
      // message says what to do rather than what went wrong.
      report(
        "That did not send — the request could not leave the browser. Check the connection and try again.",
        "error",
      );
      current.send.disabled = false;
    }
  }
}
