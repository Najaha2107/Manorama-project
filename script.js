const newsInput = document.getElementById("newsInput");
const addNewsBtn = document.getElementById("addNewsBtn");
const generateBtn = document.getElementById("generateBtn");
const importFile = document.getElementById("importFile");
const announcementList = document.getElementById("announcementList");
const tickerList = document.getElementById("tickerList");
const inputMessage = document.getElementById("inputMessage");
const generationMessage = document.getElementById("generationMessage");
const exportApprovedBtn = document.getElementById("exportApprovedBtn");
const tickerCount = document.getElementById("tickerCount");

let announcements = [];
let tickers = [];
let nextId = 1;

const countWords = (text) => (text.trim().match(/\S+/g) || []).length;

function setMessage(element, message, type = "") {
  element.textContent = message;
  element.className = `message ${type}`.trim();
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function addAnnouncement(text) {
  const cleaned = String(text || "").trim();
  if (!cleaned) return false;

  announcements.push({
    id: nextId++,
    text: cleaned,
    generated: false
  });
  renderAnnouncements();
  return true;
}

function renderAnnouncements() {
  if (!announcements.length) {
    announcementList.innerHTML = "";
    return;
  }

  announcementList.innerHTML = announcements.map((item) => `
    <article class="announcement-card">
      <div class="announcement-top">
        <strong>Announcement #${item.id}</strong>
        <div class="card-actions">
          <span class="status-pill ${item.generated ? "approved" : "pending"}">${item.generated ? "Ticker generated" : "Ready to generate"}</span>
          <button class="small-button" data-action="remove-announcement" data-id="${item.id}">Remove</button>
        </div>
      </div>
      <p class="source-text">${escapeHTML(item.text)}</p>
    </article>
  `).join("");
}

function makeTicker(source, text) {
  return {
    id: nextId++,
    sourceId: source.id,
    source: source.text,
    text: text || "",
    originalText: text || "",
    editStartText: text || "",
    approved: false,
    topic: "General",
    priority: "Medium",
    drift: null,
    alternatives: [],
    history: [],
    lastSavedText: text || ""
  };
}

function renderTickers() {
  tickerCount.textContent = `${tickers.length} ticker${tickers.length === 1 ? "" : "s"}`;

  if (!tickers.length) {
    tickerList.innerHTML = '<div class="empty-state">Your generated tickers will appear here.</div>';
    return;
  }

  tickerList.innerHTML = tickers.map((ticker) => {
    const words = countWords(ticker.text);
    const drift = ticker.drift;
    const cardClasses = [
      "ticker-card",
      ticker.approved ? "approved" : "",
      drift && drift.driftDetected ? "needs-review" : ""
    ].filter(Boolean).join(" ");

    const alternativesHTML = ticker.alternatives.length ? `
      <div class="alternative-box">
        <strong>Alternative versions</strong>
        <div class="alternative-list">
          ${ticker.alternatives.map((alternative, index) => `
            <label class="alternative-option">
              <input type="radio" name="alternative-${ticker.id}" value="${index}">
              <span>${escapeHTML(alternative)} <small>(${countWords(alternative)} words)</small></span>
            </label>
          `).join("")}
        </div>
        <div class="button-row">
          <button class="small-button" data-action="use-alternative" data-id="${ticker.id}">Use selected alternative</button>
        </div>
      </div>
    ` : "";

    const driftHTML = drift ? `
      <div class="drift-box ${drift.driftDetected ? "warning" : "ok"}">
        <strong>${drift.driftDetected ? "âš  Source drift may be present" : "âœ“ No obvious source drift found"}</strong>
        <p>${escapeHTML(drift.explanation || "")}</p>
        ${drift.concerns?.length ? `<p><strong>Check:</strong> ${escapeHTML(drift.concerns.join("; "))}</p>` : ""}
        <small>Automated check is only a warning; verify the original source manually.</small>
      </div>
    ` : "";

    const historyHTML = ticker.history.length ? `
      <div class="history-box">
        <strong>Previous versions</strong>
        <p>${ticker.history.length} saved version(s)</p>
        <div class="button-row">
          <button class="small-button" data-action="undo" data-id="${ticker.id}">Undo last edit</button>
          <button class="small-button" data-action="revert-original" data-id="${ticker.id}">Revert to last generated</button>
        </div>
      </div>
    ` : `
      <div class="history-box">
        <strong>Version history</strong>
        <p>No earlier edits saved yet.</p>
        <div class="button-row">
          <button class="small-button" data-action="revert-original" data-id="${ticker.id}">Revert to last generated</button>
        </div>
      </div>
    `;

    return `
      <article class="${cardClasses}" data-ticker-id="${ticker.id}">
        <div class="ticker-top">
          <div class="tag-row">
            <strong>Ticker #${ticker.id}</strong>
            <span class="status-pill ${ticker.approved ? "approved" : "pending"}">${ticker.approved ? "Approved" : "Needs review"}</span>
            ${drift?.driftDetected ? '<span class="status-pill drift">Drift warning</span>' : ""}
          </div>
          <div class="card-actions">
            <button class="small-button" data-action="move-up" data-id="${ticker.id}" aria-label="Move ticker up">â†‘ Move up</button>
            <button class="small-button" data-action="move-down" data-id="${ticker.id}" aria-label="Move ticker down">â†“ Move down</button>
          </div>
        </div>

        <p class="source-text"><strong>Original source:</strong> ${escapeHTML(ticker.source)}</p>
        <label for="ticker-text-${ticker.id}">Editable ticker</label>
        <textarea class="ticker-editor" id="ticker-text-${ticker.id}" data-ticker-input="${ticker.id}" rows="2">${escapeHTML(ticker.text)}</textarea>
        <div class="word-info ${words > 10 ? "over-limit" : ""}">
          <span data-word-count="${ticker.id}">${words} / 10 words</span>
          <span>${words > 10 ? "Too long â€” shorten before approval" : words >= 8 ? "Nearly at the limit" : "Within the word limit"}</span>
        </div>
        <p class="style-hint" data-style-hint="${ticker.id}">${styleHint(ticker.text)}</p>

        <div class="field-grid">
          <label>Topic
            <select data-topic="${ticker.id}">
              ${["General", "Education", "Technology", "Sports", "Business", "Community", "Politics", "Weather", "Entertainment"].map(topic =>
                `<option ${ticker.topic === topic ? "selected" : ""}>${topic}</option>`
              ).join("")}
            </select>
          </label>
          <label>Priority
            <select data-priority="${ticker.id}">
              ${["High", "Medium", "Low"].map(priority =>
                `<option ${ticker.priority === priority ? "selected" : ""}>${priority}</option>`
              ).join("")}
            </select>
          </label>
          <label>Approval
            <select data-approval="${ticker.id}">
              <option value="false" ${!ticker.approved ? "selected" : ""}>Needs review</option>
              <option value="true" ${ticker.approved ? "selected" : ""}>Approved</option>
            </select>
          </label>
        </div>
        <div class="tag-row" style="margin-top:9px">
          <span class="tag">${escapeHTML(ticker.topic)}</span>
          <span class="tag">${escapeHTML(ticker.priority)} priority</span>
        </div>

        <div class="button-row">
          <button class="primary" data-action="alternatives" data-id="${ticker.id}">Generate alternatives</button>
          <button class="secondary" data-action="drift" data-id="${ticker.id}">Check source drift</button>
          <button class="secondary" data-action="undo" data-id="${ticker.id}">Undo</button>
          <button class="secondary" data-action="approve" data-id="${ticker.id}">${ticker.approved ? "Unapprove" : "Approve ticker"}</button>
          <button class="danger-button" data-action="delete-ticker" data-id="${ticker.id}">Delete</button>
        </div>
        <p class="message" data-card-message="${ticker.id}" role="status"></p>
        ${driftHTML}
        ${alternativesHTML}
        ${historyHTML}
      </article>
    `;
  }).join("");
}

function styleHint(text) {
  const words = countWords(text);
  if (!text.trim()) return "Enter a concise, factual broadcast-style sentence.";
  if (words > 10) return "Style hint: remove extra words and keep the key fact.";
  if (/[!?]{2,}/.test(text)) return "Style hint: use a neutral broadcast tone; avoid repeated punctuation.";
  if (text.length > 120) return "Style hint: this may be too long for a quick on-screen ticker.";
  if (words < 4) return "Style hint: ensure the ticker contains enough context to be understood.";
  return "Style hint: concise and readable. Verify names, numbers, and dates against the source.";
}

function saveBeforeChange(ticker) {
  if (ticker.text !== ticker.lastSavedText) {
    ticker.history.push(ticker.lastSavedText);
    if (ticker.history.length > 20) ticker.history.shift();
    ticker.lastSavedText = ticker.text;
  }
}

function updateTickerText(id, newText) {
  const ticker = tickers.find(item => item.id === Number(id));
  if (!ticker) return;
  if (ticker.text !== newText) {
    ticker.history.push(ticker.text);
    if (ticker.history.length > 20) ticker.history.shift();
    ticker.text = newText;
    ticker.lastSavedText = newText;
    ticker.approved = false;
    ticker.drift = null;
  }

  const words = countWords(newText);
  const count = document.querySelector(`[data-word-count="${id}"]`);
  const hint = document.querySelector(`[data-style-hint="${id}"]`);
  if (count) {
    count.textContent = `${words} / 10 words`;
    count.parentElement.classList.toggle("over-limit", words > 10);
    count.nextElementSibling.textContent = words > 10
      ? "Too long â€” shorten before approval"
      : words >= 8 ? "Nearly at the limit" : "Within the word limit";
  }
  if (hint) hint.textContent = styleHint(newText);
}

async function postJSON(url, data) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Request failed.");
  return payload;
}

addNewsBtn.addEventListener("click", () => {
  if (addAnnouncement(newsInput.value)) {
    newsInput.value = "";
    setMessage(inputMessage, "Announcement added.", "success");
  } else {
    setMessage(inputMessage, "Please enter an announcement first.", "error");
  }
});

newsInput.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") addNewsBtn.click();
});

announcementList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action='remove-announcement']");
  if (!button) return;
  const id = Number(button.dataset.id);
  announcements = announcements.filter(item => item.id !== id);
  renderAnnouncements();
});

importFile.addEventListener("change", async () => {
  const file = importFile.files?.[0];
  if (!file) return;

  try {
    const content = await file.text();
    const ext = file.name.split(".").pop().toLowerCase();
    let rows = [];

    if (ext === "json") {
      const parsed = JSON.parse(content);
      const list = Array.isArray(parsed) ? parsed : (parsed.announcements || parsed.items || []);
      rows = list.map(item => typeof item === "string" ? item : (item.text || item.announcement || item.source || ""));
    } else if (ext === "csv") {
      rows = parseCSV(content);
    } else {
      rows = content.split(/\r?\n/);
    }

    const added = rows.filter(row => String(row).trim()).reduce((count, row) => count + (addAnnouncement(row) ? 1 : 0), 0);
    setMessage(inputMessage, `Imported ${added} announcement(s).`, "success");
  } catch (error) {
    setMessage(inputMessage, `Import failed: ${error.message}`, "error");
  } finally {
    importFile.value = "";
  }
});

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (!lines.length) return [];
  const parseLine = (line) => {
    const result = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' && line[i + 1] === '"' && quoted) {
        field += '"'; i++;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === "," && !quoted) {
        result.push(field.trim()); field = "";
      } else {
        field += char;
      }
    }
    result.push(field.trim());
    return result;
  };

  const first = parseLine(lines[0]);
  const hasHeader = first.some(value => /^(announcement|text|source|news)$/i.test(value));
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const textIndex = hasHeader ? Math.max(0, first.findIndex(value => /^(announcement|text|source|news)$/i.test(value))) : 0;
  return dataLines.map(line => parseLine(line)[textIndex] || parseLine(line).join(" ")).filter(Boolean);
}

generateBtn.addEventListener("click", async () => {
  const pending = announcements.filter(item => !item.generated);
  if (!pending.length) {
    setMessage(generationMessage, announcements.length ? "All announcements already have tickers." : "Add or import an announcement before generating tickers.", "error");
    return;
  }

  generateBtn.disabled = true;
  setMessage(generationMessage, `Generating tickers for ${pending.length} announcement(s)â€¦`);
  try {
    for (const announcement of pending) {
      const result = await postJSON("/api/generate", { announcement: announcement.text });
      tickers.push(makeTicker(announcement, result.ticker));
      if (result.mode === "fallback") setMessage(generationMessage, result.notice || "AI unavailable; local fallback used.", "success");
      announcement.generated = true;
      renderAnnouncements();
      renderTickers();
    }
    const usedFallback = pending.some(item => tickers.some(ticker => ticker.sourceId === item.id && ticker.text));
    setMessage(generationMessage, "Ticker generation complete. Review every ticker against the original source before approving.", "success");
  } catch (error) {
    setMessage(generationMessage, error.message, "error");
  } finally {
    generateBtn.disabled = false;
  }
});

tickerList.addEventListener("focusin", (event) => {
  const editor = event.target.closest("textarea[data-ticker-input]");
  if (!editor) return;
  const ticker = tickers.find(item => item.id === Number(editor.dataset.tickerInput));
  if (ticker) ticker.editStartText = ticker.text;
});

tickerList.addEventListener("input", (event) => {
  const editor = event.target.closest("textarea[data-ticker-input]");
  if (editor) updateTickerText(editor.dataset.tickerInput, editor.value);
});

tickerList.addEventListener("focusout", (event) => {
  const editor = event.target.closest("textarea[data-ticker-input]");
  if (!editor) return;
  const ticker = tickers.find(item => item.id === Number(editor.dataset.tickerInput));
  if (!ticker || ticker.editStartText === ticker.text) return;
  ticker.history.push(ticker.editStartText);
  if (ticker.history.length > 20) ticker.history.shift();
  ticker.lastSavedText = ticker.text;
});

tickerList.addEventListener("change", (event) => {
  const topicSelect = event.target.closest("select[data-topic]");
  const prioritySelect = event.target.closest("select[data-priority]");
  const approvalSelect = event.target.closest("select[data-approval]");
  if (topicSelect) {
    const ticker = tickers.find(item => item.id === Number(topicSelect.dataset.topic));
    if (ticker) ticker.topic = topicSelect.value;
    renderTickers();
  }
  if (prioritySelect) {
    const ticker = tickers.find(item => item.id === Number(prioritySelect.dataset.priority));
    if (ticker) ticker.priority = prioritySelect.value;
    renderTickers();
  }
  if (approvalSelect) {
    const ticker = tickers.find(item => item.id === Number(approvalSelect.dataset.approval));
    if (!ticker) return;
    ticker.approved = approvalSelect.value === "true" && countWords(ticker.text) <= 10;
    if (approvalSelect.value === "true" && countWords(ticker.text) > 10) {
      alert("Please shorten this ticker to 10 words or fewer before approving.");
    }
    renderTickers();
  }
});

tickerList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = Number(button.dataset.id);
  const ticker = tickers.find(item => item.id === id);
  if (!ticker) return;
  const action = button.dataset.action;
  const message = document.querySelector(`[data-card-message="${id}"]`);

  if (action === "approve") {
    if (!ticker.approved && countWords(ticker.text) > 10) {
      setMessage(message, "Shorten this ticker to 10 words or fewer before approval.", "error");
      return;
    }
    ticker.approved = !ticker.approved;
    renderTickers();
    return;
  }

  if (action === "delete-ticker") {
    tickers = tickers.filter(item => item.id !== id);
    renderTickers();
    return;
  }

  if (action === "move-up" || action === "move-down") {
    const index = tickers.findIndex(item => item.id === id);
    const next = action === "move-up" ? index - 1 : index + 1;
    if (next >= 0 && next < tickers.length) {
      [tickers[index], tickers[next]] = [tickers[next], tickers[index]];
      renderTickers();
    }
    return;
  }

  if (action === "undo") {
    if (!ticker.history.length) {
      setMessage(message, "There is no earlier version to restore.", "error");
      return;
    }
    ticker.text = ticker.history.pop();
    ticker.lastSavedText = ticker.text;
    ticker.approved = false;
    ticker.drift = null;
    renderTickers();
    return;
  }

  if (action === "revert-original") {
    if (ticker.originalText === ticker.text) {
      setMessage(message, "This ticker is already at its originally generated version.", "error");
      return;
    }
    ticker.history.push(ticker.text);
    ticker.text = ticker.originalText;
    ticker.history = [];
    ticker.lastSavedText = ticker.text;
    ticker.approved = false;
    ticker.drift = null;
    renderTickers();
    return;
  }

  if (action === "use-alternative") {
    const selected = document.querySelector(`input[name="alternative-${id}"]:checked`);
    if (!selected) {
      setMessage(message, "Select an alternative first.", "error");
      return;
    }
    const alternative = ticker.alternatives[Number(selected.value)];
    ticker.history.push(ticker.text);
    ticker.text = alternative;
    ticker.lastSavedText = alternative;
    ticker.approved = false;
    ticker.drift = null;
    renderTickers();
    return;
  }

  if (action === "alternatives") {
    button.disabled = true;
    setMessage(message, "Generating alternativesâ€¦");
    try {
      const result = await postJSON("/api/alternatives", { announcement: ticker.source, ticker: ticker.text });
      ticker.alternatives = result.alternatives || [];
      renderTickers();
      const newMessage = document.querySelector(`[data-card-message="${id}"]`);
      setMessage(newMessage, result.notice || (ticker.alternatives.length ? "Alternatives are ready below." : "No alternatives were returned."), "success");
    } catch (error) {
      setMessage(message, error.message, "error");
      button.disabled = false;
    }
    return;
  }

  if (action === "drift") {
    button.disabled = true;
    setMessage(message, "Checking ticker against the original sourceâ€¦");
    try {
      const result = await postJSON("/api/check-drift", { announcement: ticker.source, ticker: ticker.text });
      ticker.drift = result;
      renderTickers();
    } catch (error) {
      setMessage(message, error.message, "error");
      button.disabled = false;
    }
  }
});

exportApprovedBtn.addEventListener("click", () => {
  const approved = tickers.filter(ticker => ticker.approved).map(ticker => ({
    id: ticker.id,
    source: ticker.source,
    ticker: ticker.text,
    wordCount: countWords(ticker.text),
    topic: ticker.topic,
    priority: ticker.priority,
    approved: ticker.approved,
    driftCheck: ticker.drift
  }));

  if (!approved.length) {
    setMessage(generationMessage, "No approved tickers to export yet.", "error");
    return;
  }

  downloadFile("approved-tickers.json", JSON.stringify(approved, null, 2), "application/json");
});

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

renderAnnouncements();
renderTickers();


// System status dashboard: the server health endpoint checks real connectivity.
const refreshStatusBtn = document.getElementById("refreshStatusBtn");
const dashboardMessage = document.getElementById("dashboardMessage");

function setStatusIndicator(dotId, textId, state, label) {
  const dot = document.getElementById(dotId);
  const text = document.getElementById(textId);
  if (dot) dot.className = `status-dot ${state}`;
  if (text) text.textContent = label;
}

function formatUptime(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = Math.floor(total % 60);
  return `${days ? `${days}d ` : ""}${hours}h ${minutes}m ${secs}s`;
}

async function refreshSystemStatus() {
  refreshStatusBtn.disabled = true;
  refreshStatusBtn.textContent = "Refreshingâ€¦";
  setStatusIndicator("serverStatusDot", "serverStatusText", "checking", "Checkingâ€¦");
  setStatusIndicator("aiStatusDot", "aiStatusText", "checking", "Checkingâ€¦");
  document.getElementById("serverStatusDetail").textContent = "Connecting to local server";
  document.getElementById("aiStatusDetail").textContent = "Checking server configuration";
  try {
    const response = await fetch(`/api/health?time=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Health endpoint returned an error.");
    const health = await response.json();
    setStatusIndicator("serverStatusDot", "serverStatusText", "online", "Online");
    document.getElementById("serverStatusDetail").textContent = `Service: ${health.service || "News Ticker Generator"}`;
    document.getElementById("serverUptime").textContent = formatUptime(health.uptimeSeconds);
    document.getElementById("serverStartedAt").textContent = health.startedAt
      ? `Started ${new Date(health.startedAt).toLocaleString()}`
      : "Start time unavailable";

    if (health.aiConfigured) {
      setStatusIndicator("aiStatusDot", "aiStatusText", "online", "Key configured");
      document.getElementById("aiStatusDetail").textContent = "API key found in server environment";
    } else {
      setStatusIndicator("aiStatusDot", "aiStatusText", "missing", "Not configured");
      document.getElementById("aiStatusDetail").textContent = "Add OPENAI_API_KEY to your .env file";
    }
    setMessage(dashboardMessage, health.fallbackEnabled ? `Status updated. Automatic local fallback is enabled (${health.generationMode || "fallback ready"}).` : "Status updated successfully.", "success");
  } catch (error) {
    setStatusIndicator("serverStatusDot", "serverStatusText", "offline", "Offline");
    setStatusIndicator("aiStatusDot", "aiStatusText", "checking", "Unavailable");
    document.getElementById("serverStatusDetail").textContent = "Could not reach /api/health";
    document.getElementById("aiStatusDetail").textContent = "Start the server with npm start";
    document.getElementById("serverUptime").textContent = "â€”";
    document.getElementById("serverStartedAt").textContent = "No server response";
    setMessage(dashboardMessage, "Cannot connect to the server. In VS Code Terminal, run npm start and refresh this page.", "error");
  } finally {
    refreshStatusBtn.disabled = false;
    refreshStatusBtn.textContent = "Refresh status";
  }
}

refreshStatusBtn.addEventListener("click", refreshSystemStatus);
refreshSystemStatus();