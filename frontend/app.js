"use strict";

/* ── State ──────────────────────────────────────────────────────────────── */
let currentReport = null;
let pendingOverrides = [];   // [{category, criterion, new_marks, reason}]

/* ── Element refs ───────────────────────────────────────────────────────── */
const rfpInput    = document.getElementById("rfp-input");
const bidInput    = document.getElementById("bid-input");
const rfpZone     = document.getElementById("rfp-zone");
const bidZone     = document.getElementById("bid-zone");
const rfpName     = document.getElementById("rfp-name");
const bidName     = document.getElementById("bid-name");
const evaluateBtn = document.getElementById("evaluate-btn");

/* ── File handling ──────────────────────────────────────────────────────── */
function attachFileInput(input, zone, nameEl) {
  input.addEventListener("change", () => {
    if (input.files[0]) setFileSelected(zone, nameEl, input.files[0].name);
  });

  zone.addEventListener("dragover",  e => { e.preventDefault(); zone.classList.add("drag"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag"));
  zone.addEventListener("drop", e => {
    e.preventDefault();
    zone.classList.remove("drag");
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    setFileSelected(zone, nameEl, file.name);
  });

  zone.addEventListener("click", e => {
    if (!e.target.classList.contains("upload-btn")) input.click();
  });
}

function setFileSelected(zone, nameEl, name) {
  zone.classList.add("has-file");
  nameEl.textContent = "✓ " + name;
  checkReady();
}

function checkReady() {
  evaluateBtn.disabled = !(rfpInput.files[0] && bidInput.files[0]);
}

attachFileInput(rfpInput, rfpZone, rfpName);
attachFileInput(bidInput, bidZone, bidName);

/* ── Pipeline step helpers ──────────────────────────────────────────────── */
function setStep(n, state) {
  const el  = document.getElementById("step-" + n);
  if (!el) return;
  el.classList.remove("active", "done");
  if (state !== "pending") el.classList.add(state);

  const badge = el.querySelector(".pipe-badge");
  badge.className = "pipe-badge " + state;
  badge.textContent = state === "active" ? "Running…" : state === "done" ? "✓ Done" : "Pending";
}

function allStepsDone() {
  for (let i = 1; i <= 6; i++) setStep(i, "done");
}

/* ── Evaluation ─────────────────────────────────────────────────────────── */
evaluateBtn.addEventListener("click", runEvaluation);

async function runEvaluation() {
  const rfpFile = rfpInput.files[0];
  const bidFile = bidInput.files[0];
  if (!rfpFile || !bidFile) return;

  // Show progress, hide results
  show("progress-section");
  hide("results-section");
  evaluateBtn.disabled = true;

  // Approximate step timing (each Claude call takes ~5–15 s)
  const timers = [
    setTimeout(() => setStep(1, "active"), 0),
    setTimeout(() => setStep(1, "done"),   900),
    setTimeout(() => setStep(2, "active"), 1000),
    setTimeout(() => setStep(2, "done"),   12000),
    setTimeout(() => setStep(3, "active"), 12500),
    setTimeout(() => setStep(3, "done"),   30000),
    setTimeout(() => setStep(4, "active"), 30500),
    setTimeout(() => setStep(4, "done"),   38000),
    setTimeout(() => setStep(5, "active"), 38500),
    setTimeout(() => setStep(5, "done"),   50000),
    setTimeout(() => setStep(6, "active"), 50500),
  ];

  const formData = new FormData();
  formData.append("rfp_file", rfpFile);
  formData.append("bid_file",  bidFile);

  try {
    const res = await fetch("/api/evaluate", { method: "POST", body: formData });

    timers.forEach(clearTimeout);
    allStepsDone();

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      const msg = err.detail || "Evaluation failed.";
      if (msg.startsWith("NO_RULES_FOUND")) {
        alert(
          "No scoring rules were found in the RFP document.\n\n" +
          "Please upload an RFP that contains an explicit evaluation criteria table " +
          "or scoring matrix (e.g., “Technical Score: 70 marks”)."
        );
      } else {
        alert("Error: " + msg);
      }
      resetUI();
      return;
    }

    currentReport = await res.json();

    await pause(400);   // let "Done" badges render
    hide("progress-section");
    renderReport(currentReport);
    show("results-section");
    document.getElementById("results-section").scrollIntoView({ behavior: "smooth" });

  } catch (e) {
    timers.forEach(clearTimeout);
    alert("Network error: " + e.message);
    resetUI();
  }
}

function resetUI() {
  evaluateBtn.disabled = false;
  hide("progress-section");
  for (let i = 1; i <= 6; i++) setStep(i, "pending");
}

/* ── Report rendering ───────────────────────────────────────────────────── */
function renderReport(report) {
  renderVerdict(report);
  renderSummary(report);
  renderDisqualification(report);
  renderCategories(report);
  renderDisqualifierChecks(report);
  renderCriteriaAccordion(report);
  renderRisks(report);
  populateOverrideDropdowns(report);
}

/* Verdict banner */
function renderVerdict(r) {
  const banner = document.getElementById("verdict-banner");
  banner.className = "verdict-banner " + (r.passed ? "passed" : "failed");
  el("v-score").textContent     = r.total_score;
  el("v-max").textContent       = r.max_score;
  el("v-label").textContent     = r.passed ? "✓ PASSED" : "✗ FAILED";
  el("v-threshold").textContent = "Threshold: " + r.threshold + " / " + r.max_score;
}

/* Executive summary */
function renderSummary(r) {
  el("exec-summary").textContent = r.executive_summary;
}

/* Disqualification alert */
function renderDisqualification(r) {
  const card = document.getElementById("disq-alert");
  if (r.disqualified && r.disqualification_reason) {
    el("disq-reason").textContent =
      "This bid was automatically disqualified because: " + r.disqualification_reason;
    card.classList.remove("hidden");
  } else {
    card.classList.add("hidden");
  }
}

/* Category breakdown */
function renderCategories(r) {
  const tbody = el("cat-tbody");
  const tfoot = el("cat-tfoot");
  tbody.innerHTML = "";

  r.category_results.forEach(cat => {
    const minTxt = cat.minimum_required != null ? cat.minimum_required + "%" : "&mdash;";
    tbody.insertAdjacentHTML("beforeend", `
      <tr>
        <td><strong>${esc(cat.category)}</strong></td>
        <td>${cat.max_marks}</td>
        <td>${cat.marks_awarded.toFixed(1)}</td>
        <td>${cat.percent_achieved}%</td>
        <td>${minTxt}</td>
        <td>${badge(cat.passed ? "pass" : "fail", cat.passed ? "✓ Pass" : "✗ Fail")}</td>
      </tr>`);
  });

  const overallPct = r.max_score ? ((r.total_score / r.max_score) * 100).toFixed(1) : "0.0";
  tfoot.innerHTML = `
    <tr>
      <td>Total (Weighted)</td>
      <td>${r.max_score}</td>
      <td>${r.total_score}</td>
      <td>${overallPct}%</td>
      <td>&ge; ${r.threshold}</td>
      <td>${badge(r.passed ? "pass" : "fail", r.passed ? "✓ PASSED" : "✗ FAILED")}</td>
    </tr>`;
}

/* Mandatory checks */
function renderDisqualifierChecks(r) {
  const card  = document.getElementById("disq-checks-card");
  const tbody = el("disq-tbody");
  tbody.innerHTML = "";

  if (!r.disqualifier_checks || r.disqualifier_checks.length === 0) {
    card.classList.add("hidden");
    return;
  }
  card.classList.remove("hidden");
  r.disqualifier_checks.forEach(d => {
    tbody.insertAdjacentHTML("beforeend", `
      <tr>
        <td>${esc(d.condition)}</td>
        <td>${badge(d.met ? "met" : "fail", d.met ? "✓ Met" : "✗ Not Met")}</td>
        <td style="font-size:.82rem">${esc(d.note)}</td>
      </tr>`);
  });
}

/* Criteria accordion (grouped by category) */
function renderCriteriaAccordion(r) {
  const acc = el("criteria-accordion");
  acc.innerHTML = "";

  r.category_results.forEach((cat, ci) => {
    const rowsHtml = cat.criteria.map(c => `
      <tr>
        <td>
          ${esc(c.criterion)}
          ${c.is_mandatory ? badge("mand", "Mandatory") : ""}
        </td>
        <td>${c.max_marks}</td>
        <td>${c.marks_awarded.toFixed(1)}</td>
        <td>${badge(statusClass(c.compliance_status), c.compliance_status)}</td>
        <td style="font-size:.8rem;max-width:260px">${esc(c.vendor_claim)}</td>
        <td style="font-size:.8rem">${esc(c.source_reference)}</td>
        <td>${badge(confClass(c.confidence), c.confidence)}</td>
      </tr>`).join("");

    acc.insertAdjacentHTML("beforeend", `
      <div class="acc-item">
        <div class="acc-header" onclick="toggleAcc(this)">
          <div class="acc-title">
            ${esc(cat.category)}
            ${badge(cat.passed ? "pass" : "fail", cat.marks_awarded.toFixed(1) + " / " + cat.max_marks)}
          </div>
          <span class="acc-arrow" id="arrow-${ci}">▼</span>
        </div>
        <div class="acc-body" id="body-${ci}">
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Criterion</th><th>Max</th><th>Awarded</th>
                  <th>Status</th><th>Vendor Evidence</th>
                  <th>Source</th><th>Confidence</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        </div>
      </div>`);
  });
}

function toggleAcc(header) {
  const body  = header.nextElementSibling;
  const arrow = header.querySelector(".acc-arrow");
  body.classList.toggle("open");
  arrow.classList.toggle("open");
}

/* Gap / risk analysis */
function renderRisks(r) {
  const tbody = el("risk-tbody");
  tbody.innerHTML = "";

  if (!r.risk_items || r.risk_items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:var(--muted);padding:1.5rem">No significant risks identified.</td></tr>`;
    return;
  }
  r.risk_items.forEach(risk => {
    tbody.insertAdjacentHTML("beforeend", `
      <tr>
        <td><strong>${esc(risk.risk_area)}</strong></td>
        <td>${badge(risk.severity.toLowerCase(), risk.severity)}</td>
        <td style="font-size:.875rem">${esc(risk.description)}</td>
      </tr>`);
  });
}

/* Override dropdowns */
function populateOverrideDropdowns(r) {
  const catSel = el("ov-category");
  catSel.innerHTML = '<option value="">— Select Category —</option>';
  r.category_results.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat.category;
    opt.textContent = cat.category;
    catSel.appendChild(opt);
  });
  el("ov-criterion").innerHTML = '<option value="">— Select Criterion —</option>';
}

el("ov-category").addEventListener("change", () => {
  const catName = el("ov-category").value;
  const critSel = el("ov-criterion");
  critSel.innerHTML = '<option value="">— Select Criterion —</option>';
  if (!catName || !currentReport) return;
  const cat = currentReport.category_results.find(c => c.category === catName);
  if (!cat) return;
  cat.criteria.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.criterion;
    opt.dataset.max = c.max_marks;
    opt.textContent = c.criterion + " (max: " + c.max_marks + ")";
    critSel.appendChild(opt);
  });
});

el("ov-add-btn").addEventListener("click", () => {
  const category  = el("ov-category").value;
  const criterion = el("ov-criterion").value;
  const marks     = parseFloat(el("ov-marks").value);
  const reason    = el("ov-reason").value.trim();

  if (!category || !criterion || isNaN(marks) || marks < 0) {
    alert("Please select a category, criterion, and enter a valid mark value.");
    return;
  }

  const opt = el("ov-criterion").querySelector(`option[value="${criterion}"]`);
  const maxMarks = opt ? parseFloat(opt.dataset.max) : Infinity;
  if (marks > maxMarks) {
    alert("New marks (" + marks + ") exceed maximum (" + maxMarks + ") for this criterion.");
    return;
  }

  const idx = pendingOverrides.length;
  pendingOverrides.push({ category, criterion, new_marks: marks, reason });

  el("ov-tags").insertAdjacentHTML("beforeend", `
    <span class="ov-tag" data-idx="${idx}">
      ${esc(criterion)}: ${marks} marks
      <span class="rm" onclick="removeOverride(${idx})">&times;</span>
    </span>`);

  el("ov-marks").value  = "";
  el("ov-reason").value = "";
});

window.removeOverride = function(idx) {
  pendingOverrides[idx] = null;
  document.querySelectorAll(`.ov-tag[data-idx="${idx}"]`).forEach(t => t.remove());
};

el("ov-apply-btn").addEventListener("click", async () => {
  const active = pendingOverrides.filter(Boolean);
  if (!active.length) { alert("No overrides to apply."); return; }

  try {
    const res = await fetch("/api/override", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ report: currentReport, overrides: active }),
    });
    if (!res.ok) throw new Error(await res.text());
    currentReport = await res.json();
    pendingOverrides = [];
    el("ov-tags").innerHTML = "";
    renderReport(currentReport);
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (e) {
    alert("Override failed: " + e.message);
  }
});

/* New evaluation */
el("new-eval-btn").addEventListener("click", () => {
  currentReport    = null;
  pendingOverrides = [];

  rfpInput.value = "";
  bidInput.value = "";
  rfpName.textContent = "";
  bidName.textContent = "";
  rfpZone.classList.remove("has-file");
  bidZone.classList.remove("has-file");
  evaluateBtn.disabled = true;

  for (let i = 1; i <= 6; i++) setStep(i, "pending");
  hide("results-section");
  hide("progress-section");
  document.getElementById("upload-section").scrollIntoView({ behavior: "smooth" });
});

/* ── Helpers ────────────────────────────────────────────────────────────── */
function el(id)             { return document.getElementById(id); }
function show(id)           { el(id).classList.remove("hidden"); }
function hide(id)           { el(id).classList.add("hidden"); }
function pause(ms)          { return new Promise(r => setTimeout(r, ms)); }
function esc(s)             { return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function badge(cls, label)  { return `<span class="badge badge-${cls}">${esc(label)}</span>`; }

function statusClass(s) {
  if (s === "Met")     return "met";
  if (s === "Partial") return "partial";
  return "notmet";
}
function confClass(c) {
  if (c === "High")   return "pass";
  if (c === "Medium") return "medium";
  return "fail";
}

window.toggleAcc = toggleAcc;
