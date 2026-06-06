"""
Create two sample vendor bid DOCX files for the PNB GenAI RFP:
  - PNB_Vendor_PASS.docx  — TechNova AI Solutions (designed to PASS)
  - PNB_Vendor_FAIL.docx  — QuickBuild Tech (designed to FAIL)

RFP Scoring Structure (100 marks total, 70% threshold in EACH category):
  Category A: Bidder GenAI Delivery Capability — 55 marks (need ≥38.5)
    Sub-1.a: GenAI Experience (20 marks)   tiers: 10+→20, 7-9→16, 5-6→12, 3-4→8
    Sub-1.b: BFSI GenAI Experience (10 marks) tiers: 3+→10, 2→6, 1→3
    Sub-1.c: Scale of Implementations (10 marks) tiers: 1000+→10, 100-999→6, <100→3
    Sub-2.a: Banking Domain Team (10 marks) tiers: 10+→10, 5-9→5, <5→0
    Sub-2.b: Cloud Certifications (5 marks) tiers: 50%_with_2+certs→5, 50%_1cert→3, other→1
  Category B: CSP Capabilities — 20 marks (need ≥14)
    Criterion 4: CSP GenAI Platform (10 marks)
      LLM Services (5+): 4 marks | Vector DB: 2 marks | GPU: 2 marks | Resp AI: 2 marks
    Criterion 5: CSP GenAI Implementations (10 marks) tiers: 15+→10, 10+→8, 5+→6
  Category C: Presentation & Demo — 25 marks (need ≥17.5)
    Sub-6.a: Technical Presentation (15 marks)
    Sub-6.b: Live GenAI Demonstration (10 marks) — MUST be live, pre-recorded = 0

Mandatory Eligibility (all must pass):
  - Company registered in India ≥5 years
  - GST + PAN valid
  - Annual turnover ≥ Rs.50 crores average (last 3 FYs)
  - Minimum 3 production GenAI use cases
  - Minimum 10 full-time GenAI employees
  - CSP must be MeitY empaneled
  - CSP India datacentre
  - CSP ISO 27001/27017/27018/SOC2 compliance
"""

from docx import Document
from docx.shared import Pt, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement


# ─── Formatting helpers ────────────────────────────────────────────────────

def add_heading(doc, text, level=1, color=None):
    p = doc.add_paragraph()
    p.style = doc.styles[f"Heading {level}"]
    run = p.add_run(text)
    if color:
        run.font.color.rgb = RGBColor(*color)
    return p


def add_para(doc, text, bold=False, italic=False, size=None):
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.bold = bold
    run.italic = italic
    if size:
        run.font.size = Pt(size)
    return p


def add_table(doc, headers, rows, col_widths=None):
    """Add a formatted table. headers is list of strings, rows is list of lists."""
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.style = "Table Grid"

    # Header row
    hdr = table.rows[0]
    for i, h in enumerate(headers):
        cell = hdr.cells[i]
        cell.text = h
        cell.paragraphs[0].runs[0].bold = True
        cell.paragraphs[0].runs[0].font.size = Pt(9)
        # Light blue background
        tc = cell._tc
        tcPr = tc.get_or_add_tcPr()
        shd = OxmlElement("w:shd")
        shd.set(qn("w:val"), "clear")
        shd.set(qn("w:color"), "auto")
        shd.set(qn("w:fill"), "DCE6F1")
        tcPr.append(shd)

    # Data rows
    for ri, row_data in enumerate(rows):
        row = table.rows[ri + 1]
        for ci, cell_text in enumerate(row_data):
            cell = row.cells[ci]
            cell.text = str(cell_text)
            cell.paragraphs[0].runs[0].font.size = Pt(9)

    if col_widths:
        for col_i, width in enumerate(col_widths):
            for row in table.rows:
                row.cells[col_i].width = Inches(width)

    return table


# ─── PASSING BID: TechNova AI Solutions ───────────────────────────────────

def create_pass_bid():
    doc = Document()

    # Title
    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title.add_run("TECHNICAL BID DOCUMENT")
    run.bold = True
    run.font.size = Pt(16)
    run.font.color.rgb = RGBColor(0x1F, 0x49, 0x7D)

    subtitle = doc.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run2 = subtitle.add_run(
        "RFP for Engagement of Implementation Partner for Design, Development, and\n"
        "Operationalisation of Generative AI Use Cases\n"
        "Punjab National Bank — Corrigendum 1 (Dated: 27/04/2026)"
    )
    run2.font.size = Pt(11)

    doc.add_paragraph()

    vendor_info = doc.add_paragraph()
    vendor_info.alignment = WD_ALIGN_PARAGRAPH.CENTER
    vi = vendor_info.add_run(
        "Submitted by: TechNova AI Solutions Pvt. Ltd.\n"
        "Date: June 2026\n"
        "Reference: PNB/CPPD/GenAI/2026/01"
    )
    vi.bold = True
    vi.font.size = Pt(12)

    doc.add_page_break()

    # ── Section 1: Executive Summary ──────────────────────────────────────
    add_heading(doc, "1. Executive Summary", 1)
    add_para(
        doc,
        "TechNova AI Solutions Pvt. Ltd. is pleased to submit this Technical Bid in response to the "
        "Punjab National Bank RFP for Engagement of an Implementation Partner for the Design, "
        "Development, and Operationalisation of Generative AI Use Cases. "
        "TechNova has been at the forefront of enterprise GenAI adoption since 2016 with over 12 "
        "production GenAI deployments including 4 banking-sector (BFSI) implementations and "
        "enterprise-scale systems serving 5,000+ concurrent users. We propose AWS (Amazon Web Services) "
        "as our Cloud Service Provider, which is MeitY empaneled and operates India-based data centres "
        "in Mumbai and Hyderabad, fully compliant with RBI, MeitY, and DPDP requirements.\n\n"
        "We confirm full compliance with all RFP terms including submission of Earnest Money Deposit "
        "(EMD), Performance Bank Guarantee (5% of contract value as per Annexure-21), Integrity Pact, "
        "NDA, and all required Annexures. All administrative requirements of the RFP will be met."
    )

    # ── Section 2: Company Overview ───────────────────────────────────────
    add_heading(doc, "2. Company Overview", 1)
    add_table(
        doc,
        ["Parameter", "Details"],
        [
            ["Company Name", "TechNova AI Solutions Pvt. Ltd."],
            ["Date of Incorporation", "March 14, 2014 (12 years as on RFP date)"],
            ["CIN", "U72200DL2014PTC123456"],
            ["GST Registration Number", "07AABCT1234F1ZX (Valid, Current)"],
            ["PAN", "AABCT1234F"],
            ["Registered Office", "Tower A, Cyber Hub, Gurugram, Haryana – 122002"],
            ["Annual Turnover FY 2022-23", "Rs. 68.5 Crores"],
            ["Annual Turnover FY 2023-24", "Rs. 82.0 Crores"],
            ["Annual Turnover FY 2024-25", "Rs. 95.3 Crores"],
            ["Average Annual Turnover (3 FYs)", "Rs. 81.9 Crores (exceeds Rs. 50 Crore minimum)"],
            ["Total Full-Time Employees", "312"],
            ["Full-Time GenAI Employees", "47 (exceeds minimum of 10)"],
            ["Local Content Classification", "Class I Local Supplier (>50% local content)"],
        ],
        col_widths=[2.5, 4.0],
    )
    doc.add_paragraph()
    add_para(
        doc,
        "TechNova AI Solutions has been registered in India since 2014 (over 12 years as on "
        "the RFP submission date), meeting the minimum 5-year registration requirement. "
        "We confirm no pending litigation that threatens solvency; a Litigation Certificate "
        "from our Statutory Auditor is enclosed as Annexure-5."
    )

    # ── Section 3: Eligibility Compliance ─────────────────────────────────
    add_heading(doc, "3. Eligibility Criteria Compliance", 1)
    add_para(doc, "The following table maps each mandatory eligibility criterion to our compliance status and supporting documentation.", italic=True)
    add_table(
        doc,
        ["Eligibility Criterion", "Compliance", "Evidence / Document"],
        [
            ["Company registered in India ≥5 years", "YES — 12 years", "Certificate of Incorporation enclosed (Annexure-2)"],
            ["Valid GST Registration", "YES", "GST Certificate: 07AABCT1234F1ZX (Annexure-2)"],
            ["Valid PAN", "YES", "PAN: AABCT1234F (Annexure-2)"],
            ["Annual avg turnover ≥ Rs. 50 Crores (3 FYs)", "YES — Avg Rs. 81.9 Crores", "CA Certificate enclosed (Annexure-6); Audited Balance Sheets attached"],
            ["No litigation threatening solvency", "YES", "Litigation Certificate from Statutory Auditor (Annexure-5)"],
            ["Class I or II Local Supplier", "YES — Class I", "Local Content Certificate (Annexure-19) from Statutory Auditor"],
            ["Minimum 3 production GenAI use cases", "YES — 12 production deployments", "Performance Certificates from clients (Annexure-4 series)"],
            ["Minimum 10 full-time GenAI employees", "YES — 47 employees", "Employee Strength Certificate (Company Letterhead)"],
            ["CSP MeitY Empaneled", "YES — AWS MeitY empaneled", "AWS MeitY Empanelment Certificate submitted"],
            ["CSP India datacentre availability", "YES — Mumbai (ap-south-1) + Hyderabad (ap-south-2)", "AWS datacentre documentation submitted"],
            ["CSP ISO 27001/27017/27018/SOC2 compliance", "YES — all current", "AWS compliance certificates attached"],
            ["CSP: access to 3+ leading LLMs", "YES — GPT-4, Claude, Gemini, Llama, Mistral + more", "AWS Bedrock service documentation attached"],
            ["CSP: managed vector database service", "YES — Amazon OpenSearch, Aurora pgvector", "AWS service documentation attached"],
            ["CSP: GPU compute (A100/H100 equivalent)", "YES — p4d.24xlarge (8×A100), p5.48xlarge (8×H100)", "AWS GPU instance documentation attached"],
            ["CSP: AI governance tools", "YES — Amazon Bedrock Guardrails, SageMaker Clarify", "AWS Responsible AI documentation attached"],
        ],
        col_widths=[2.5, 1.5, 2.5],
    )

    doc.add_page_break()

    # ── Section 4: Category A — Bidder GenAI Delivery Capability ──────────
    add_heading(doc, "4. Category A: Bidder GenAI Delivery Capability (55 Marks)", 1)
    add_para(
        doc,
        "This section responds to Category A of the Technical Evaluation Criteria. "
        "TechNova claims full marks of 55/55 under this category, supported by "
        "documentary evidence listed below. Note: The subcriteria scoring tiers used "
        "below are based directly on the RFP Technical Evaluation tables. "
        "These sub-criteria are part of Category A and are NOT separate scoring categories.",
    )

    # 4.1 Criterion 1: GenAI Use Cases
    add_heading(doc, "4.1 Criterion 1: GenAI Use Cases Delivered — 40 Marks", 2)

    # Sub-criterion 1.a
    add_heading(doc, "Sub-Criterion 1.a: GenAI Experience in Organisation", 3)
    add_para(
        doc,
        "RFP Scoring Tier: 10 or more production GenAI use cases = 20 marks. "
        "TechNova has successfully implemented 12 production GenAI use cases across "
        "enterprise clients. All 12 are production-deployed, not POCs or prototypes, "
        "with active end-users and verifiable performance certificates. "
        "SELF-ASSESSED MARKS: 20 out of 20.",
    )
    add_table(
        doc,
        ["#", "Use Case", "Client Sector", "Go-Live Year", "Status"],
        [
            ["1", "Intelligent Document Processing Platform", "Insurance", "2020", "Production — Active"],
            ["2", "Customer Service AI Chatbot", "Retail Banking", "2021", "Production — Active"],
            ["3", "Credit Note Drafting Assistant (LLM)", "BFSI", "2022", "Production — Active"],
            ["4", "Automated KYC Verification Agent", "NBFC", "2022", "Production — Active"],
            ["5", "GenAI-powered Code Assistant for DevOps", "IT Services", "2022", "Production — Active"],
            ["6", "RAG-based Policy Q&A for HR", "Manufacturing", "2023", "Production — Active"],
            ["7", "Personalized Marketing Content Generator", "E-commerce", "2023", "Production — Active"],
            ["8", "Agentic AI Loan Processing Assistant", "Private Bank", "2023", "Production — Active"],
            ["9", "Anti-Money Laundering (AML) Alert Analyst", "PSU Bank", "2024", "Production — Active"],
            ["10", "Regulatory Compliance Summarizer", "Insurance", "2024", "Production — Active"],
            ["11", "RM Copilot for Wealth Management", "Private Bank", "2024", "Production — Active"],
            ["12", "CASA Onboarding Document Validator", "PSU Bank", "2025", "Production — Active"],
        ],
        col_widths=[0.4, 2.5, 1.2, 1.0, 1.5],
    )

    # Sub-criterion 1.b
    doc.add_paragraph()
    add_heading(doc, "Sub-Criterion 1.b: BFSI GenAI Experience", 3)
    add_para(
        doc,
        "RFP Scoring Tier: 3 or more GenAI use cases in Banking/BFSI = 10 marks; "
        "2 use cases = 6 marks; 1 use case = 3 marks. "
        "TechNova has implemented 2 GenAI use cases specifically in the Banking and "
        "BFSI sector (use cases #3 and #8 in the table above). "
        "Both are production-deployed in regulated banking environments. "
        "SELF-ASSESSED MARKS: 6 out of 10 (2 BFSI cases — tier: 2 cases).",
    )
    add_table(
        doc,
        ["Use Case", "Bank/NBFC Client", "Year", "Performance Certificate"],
        [
            ["Credit Note Drafting Assistant", "Axis Bank Ltd. (redacted for confidentiality)", "2022", "Annexure-4A"],
            ["Agentic AI Loan Processing", "HDFC Bank Ltd. (redacted)", "2023", "Annexure-4B"],
        ],
        col_widths=[2.5, 2.0, 0.8, 1.3],
    )

    # Sub-criterion 1.c
    doc.add_paragraph()
    add_heading(doc, "Sub-Criterion 1.c: Complexity and Scale of Implementations", 3)
    add_para(
        doc,
        "RFP Scoring Tier: 1000+ users = 10 marks; 100–999 users = 6 marks; <100 users = 3 marks. "
        "TechNova's largest deployment — the Personalized Marketing Content Generator — "
        "serves approximately 800 active users across 2 geographies. "
        "Our Agentic AI Loan Processing system handles around 600 concurrent RM users. "
        "Both engagements qualify as medium-scale (100–999 users). "
        "SELF-ASSESSED MARKS: 6 out of 10 (100–999 users tier).",
    )
    add_table(
        doc,
        ["Deployment", "Active Users", "Scale Classification", "Complexity"],
        [
            ["Personalized Marketing Generator", "~800 active users", "Medium-scale (100–999)", "Multi-modal GenAI, A/B testing engine"],
            ["Agentic AI Loan Processing", "~600 RM users", "Medium-scale (100–999)", "Multi-step agent orchestration, CBS integration"],
            ["CASA Onboarding Validator", "~450 branch users", "Medium-scale (100–999)", "Agentic AI, multi-system integration"],
        ],
        col_widths=[2.5, 1.5, 1.5, 2.0],
    )

    doc.add_paragraph()

    # 4.2 Criterion 2: Team Expertise
    add_heading(doc, "4.2 Criterion 2: Team Expertise and Profile — 15 Marks", 2)

    add_heading(doc, "Sub-Criterion 2.a: Banking Domain Expertise on GenAI Use Cases", 3)
    add_para(
        doc,
        "RFP Scoring Tier: 10 or more team members with 3+ years banking domain experience = 10 marks. "
        "TechNova will deploy 14 team members with verified banking/financial-domain expertise "
        "for this PNB engagement. All 14 have at least 3 years of experience on CBS, KYC/AML, "
        "credit underwriting, or payments implementations. "
        "SELF-ASSESSED MARKS: 10 out of 10.",
    )
    add_table(
        doc,
        ["Role", "Banking Domain Experience", "Years Exp", "Key Projects"],
        [
            ["GenAI Architect (Lead)", "CBS integration, credit workflows", "8 years", "Axis Bank Credit Assist, BOB AML"],
            ["Senior ML Engineer", "KYC/AML, fraud detection", "6 years", "HDFC AML Agent, CASA Validator"],
            ["BFSI Domain Consultant 1", "Retail banking, CASA, KYC", "7 years", "PSB CASA, Axis Credit"],
            ["BFSI Domain Consultant 2", "Corporate banking, credit", "5 years", "HDFC Loan Processing"],
            ["BFSI Domain Consultant 3", "Insurance, risk management", "4 years", "ICICI Life GenAI"],
            ["LLMOps Engineer 1", "Banking data pipelines", "4 years", "BOB AML platform"],
            ["LLMOps Engineer 2", "NBFC lending systems", "3 years", "Bajaj Finserv AI"],
            ["Integration Engineer 1", "CBS, CRM, DMS integrations", "6 years", "Finacle integrations"],
            ["Integration Engineer 2", "Core banking APIs", "5 years", "FinnOne integrations"],
            ["Security & Compliance Lead", "RBI/SEBI compliance, DPDP", "7 years", "PCI-DSS, ISO27001 banking"],
            ["Cloud Architect", "Banking cloud (AWS)", "5 years", "Multiple PSU bank cloud migrations"],
            ["Data Engineer", "Banking data warehouse, EDW", "4 years", "PNB-scale EDW integrations"],
            ["QA Lead", "BFSI UAT, regulatory testing", "6 years", "Banking compliance QA"],
            ["PMO Lead", "Banking project delivery", "8 years", "10+ bank project deliveries"],
        ],
        col_widths=[1.8, 2.0, 0.8, 2.0],
    )

    doc.add_paragraph()
    add_heading(doc, "Sub-Criterion 2.b: Cloud and Infrastructure Capabilities", 3)
    add_para(
        doc,
        "RFP Scoring Tier: 50% of deployed team with 2+ leading cloud certs = 5 marks; "
        "50% with 1 cert = 3 marks; other = 1 mark. "
        "Out of the 14-member deployed team (per Annexure-20), 5 members (35.7%) hold "
        "2 or more AWS certifications. The remaining 9 team members hold 1 AWS certification each. "
        "SELF-ASSESSED MARKS: 3 out of 5 (50% threshold not met for 2+ certs; "
        "50% threshold met for 1 cert).",
    )
    add_table(
        doc,
        ["Team Member Role", "Cloud Certifications Held", "Count"],
        [
            ["GenAI Architect (Lead)", "AWS SAP, AWS MLS", "2 certs"],
            ["Cloud Architect", "AWS SAP, AWS DevOps, AWS Security", "3 certs"],
            ["LLMOps Engineer 1", "AWS MLS, AWS DevOps", "2 certs"],
            ["Senior ML Engineer", "AWS MLS, AWS SAP", "2 certs"],
            ["Security & Compliance Lead", "AWS Security, AWS SAP", "2 certs"],
            ["LLMOps Engineer 2", "AWS SAA", "1 cert"],
            ["Integration Engineer 1", "AWS SAA", "1 cert"],
            ["Integration Engineer 2", "AWS SAA", "1 cert"],
            ["Data Engineer", "AWS Database", "1 cert"],
            ["BFSI Domain Consultant 1", "AWS SAA", "1 cert"],
            ["BFSI Domain Consultant 2", "AWS SAA", "1 cert"],
            ["BFSI Domain Consultant 3", "AWS Practitioner", "1 cert"],
            ["QA Lead", "AWS Practitioner", "1 cert"],
            ["PMO Lead", "AWS Practitioner", "1 cert"],
        ],
        col_widths=[2.5, 3.0, 0.8],
    )

    doc.add_page_break()

    # ── Section 5: Category B — CSP Capabilities ──────────────────────────
    add_heading(doc, "5. Category B: CSP Capabilities and Experience (20 Marks)", 1)
    add_para(
        doc,
        "TechNova proposes Amazon Web Services (AWS) as the Cloud Service Provider for "
        "this engagement. AWS is MeitY empaneled, operates sovereign India data centres, "
        "and provides the complete GenAI platform capabilities required. "
        "Note: The subcriteria below are part of Category B and are NOT separate scoring categories.",
    )

    # Criterion 4
    add_heading(doc, "5.1 Criterion 4: CSP GenAI Platform Capabilities — 10 Marks", 2)
    add_para(doc, "RFP Mandatory Prerequisite: CSP must be MeitY empaneled with India datacentre availability. AWS satisfies this prerequisite — MeitY empanelment certificate enclosed.", italic=True)
    doc.add_paragraph()

    add_table(
        doc,
        ["CSP Platform Capability", "AWS Service", "Marks Claimed", "Evidence"],
        [
            [
                "Managed LLM Services — access to 5+ state-of-the-art LLMs (GPT-4, Claude, Gemini, Llama, Mistral): 4 marks",
                "Amazon Bedrock: Claude 3.5 Sonnet, Llama 3.1/3.3 70B, Mistral Large, Titan Text, AI21 Jurassic, Amazon Nova — 12+ LLMs",
                "4 marks",
                "AWS Bedrock LLM catalog documentation enclosed",
            ],
            [
                "Vector Database and Embeddings — managed vector database service: 2 marks",
                "Amazon OpenSearch Serverless (vector search), Amazon Aurora PostgreSQL with pgvector extension, Amazon MemoryDB",
                "2 marks",
                "AWS OpenSearch vector search documentation enclosed",
            ],
            [
                "GPU Compute and Infrastructure — GPU instances for training/fine-tuning (A100/H100): 2 marks",
                "p4d.24xlarge (8×NVIDIA A100 80GB), p5.48xlarge (8×NVIDIA H100 80GB), Amazon SageMaker Training (managed GPU)",
                "2 marks",
                "AWS GPU instance specification sheet enclosed",
            ],
            [
                "Responsible AI and Guardrails — content filtering, hallucination detection, model monitoring: 2 marks",
                "Amazon Bedrock Guardrails (content filtering, PII redaction, grounding), SageMaker Clarify (bias/explainability), Amazon Bedrock Watermarking",
                "2 marks",
                "AWS Responsible AI framework documentation enclosed",
            ],
        ],
        col_widths=[2.3, 2.5, 0.8, 1.0],
    )

    doc.add_paragraph()
    add_para(doc, "TOTAL MARKS CLAIMED FOR CRITERION 4: 10 out of 10.", bold=True)

    # Criterion 5
    doc.add_paragraph()
    add_heading(doc, "5.2 Criterion 5: GenAI Implementations on CSP — 10 Marks", 2)
    add_para(
        doc,
        "RFP Scoring Tier: 15+ GenAI use cases on CSP = 10 marks; 10–14 = 8 marks; 5–9 = 6 marks. "
        "TechNova has deployed 11 GenAI use cases on AWS (Amazon Bedrock, SageMaker, OpenSearch) "
        "for various enterprise clients. Client reference letters and undertaking from Statutory "
        "Auditor for each implementation are enclosed in Annexure-4 series. "
        "SELF-ASSESSED MARKS: 8 out of 10 (10–14 implementations tier).",
    )
    add_table(
        doc,
        ["#", "GenAI Use Case on AWS", "Client Type", "AWS Services Used"],
        [
            ["1", "Credit Note Drafting Assistant", "BFSI", "Bedrock (Claude), OpenSearch, SageMaker"],
            ["2", "KYC/AML Alert Analyst", "Banking", "Bedrock (Llama), Lambda, DynamoDB"],
            ["3", "CASA Onboarding Validator", "Banking", "Bedrock (Claude), Textract, OpenSearch"],
            ["4", "Personalized Marketing Generator", "E-commerce", "Bedrock (Titan), SageMaker, S3"],
            ["5", "RM Copilot / Loan Processing Agent", "BFSI", "Bedrock (Claude), Step Functions, RDS"],
            ["6", "Insurance Claim Processing Bot", "Insurance", "Bedrock, Textract, Lambda"],
            ["7", "HR Policy Q&A RAG System", "Manufacturing", "Bedrock (Claude), OpenSearch, S3"],
            ["8", "Code Assistant for DevOps Teams", "IT Services", "CodeWhisperer, Bedrock, CodeBuild"],
            ["9", "Regulatory Compliance Summarizer", "Insurance", "Bedrock (Mistral), SageMaker"],
            ["10", "Customer Service Chatbot", "Retail Banking", "Lex V2, Bedrock, Lambda"],
            ["11", "Intelligent Document Processing", "Insurance", "Textract, Bedrock, SageMaker"],
        ],
        col_widths=[0.4, 2.5, 1.1, 2.5],
    )
    doc.add_paragraph()
    add_para(doc, "TOTAL MARKS CLAIMED FOR CRITERION 5: 8 out of 10 (11 implementations — 10+ tier).", bold=True)

    doc.add_page_break()

    # ── Section 6: Category C — Presentation and Demo ─────────────────────
    add_heading(doc, "6. Technical Presentation and Live GenAI Demonstration", 1)
    add_para(
        doc,
        "TechNova has conducted multiple live technical presentations and GenAI "
        "demonstrations to public sector banks and financial institutions. "
        "This section presents the content, architecture, and live demonstration "
        "evidence that TechNova will replicate for PNB's evaluation committee. "
        "Both demo systems referenced below are currently live in production at "
        "banking clients and can be demonstrated interactively at any time.",
    )

    add_heading(doc, "6.1 Technical Presentation Content", 2)
    add_para(
        doc,
        "TechNova's presentation for PNB covers all evaluation areas with deep technical "
        "and domain expertise, as demonstrated in our previous presentations to "
        "Bank of Baroda (February 2026) and State Bank of India Innovation Team (March 2026).\n\n"
        "A. Understanding of PNB Requirements: TechNova has analysed the complete PNB RFP and "
        "mapped each use case to a specific AWS GenAI architecture. For Credit Assist, we map "
        "financial data aggregation from CBS/CRM → AWS Bedrock Claude 3.5 Sonnet → LangChain "
        "RAG pipeline → structured credit note output with human-in-loop validation, matching "
        "PNB's stated functional requirements exactly. For CASA Onboarding, we deploy an "
        "Agentic AI workflow using AWS Bedrock Agents + Amazon Textract for OCR → cross-field "
        "validation (PAN vs Aadhaar vs Board Resolution) → structured JSON output. "
        "Our presentation includes a PNB-specific gap analysis and regulatory alignment matrix "
        "showing RBI FREE-AI framework compliance for each use case.\n\n"
        "B. Solution Architecture: TechNova's AWS hybrid architecture for PNB includes: "
        "dedicated VPC Landing Zone (Mumbai ap-south-1 primary, Hyderabad ap-south-2 DR), "
        "AWS Direct Connect for on-premises CBS/CRM integration, Amazon Bedrock (model gateway), "
        "Amazon OpenSearch Serverless (vector database), Step Functions (agent orchestration), "
        "AWS KMS (encryption key management), CloudWatch + Bedrock Guardrails (governance). "
        "Architecture reviewed and validated by AWS Financial Services Partner. "
        "Full architecture diagrams with component-level security controls prepared.\n\n"
        "C. Implementation Timeline: Phase 1 Credit Assist (Months 1-3), Phase 2 CASA "
        "Onboarding (Months 2-4), Phase 3 RM Copilot + Marketing (Months 4-6). Each phase "
        "includes: development sprints, integration testing with CBS/CRM, security penetration "
        "testing, UAT with PNB branch users, production deployment with SLA monitoring. "
        "Milestone-based payment aligned to go-live of each use case.\n\n"
        "D. Value Proposition: Credit Assist reduces note preparation from 4 hours to 82 minutes "
        "(79% reduction, validated at Axis Bank — Performance Certificate Annexure-4A). "
        "CASA Onboarding reduces document errors by 81% (validated at Punjab and Sind Bank). "
        "RM Copilot increases cross-sell conversion by 42% (validated at HDFC Bank). "
        "All metrics independently certified by clients in performance certificates enclosed.",
    )

    add_heading(doc, "6.2 Live GenAI Demonstration", 2)
    add_para(
        doc,
        "TechNova's GenAI demonstration systems are production-deployed at banking clients "
        "and can be demonstrated live and interactively without pre-recorded videos. "
        "IMPORTANT: TechNova explicitly confirms that NO pre-recorded videos will be used "
        "in the demonstration. Both systems will be shown running live on AWS infrastructure "
        "in real-time. Pre-recorded videos are not used and will not be used.",
    )
    add_para(
        doc,
        "Demo System 1 — Credit Assist: Note Preparation Tool (directly equivalent to PNB use case):\n"
        "Current deployment: Live at Axis Bank since October 2022. 500+ credit analysts use it daily. "
        "The system is a production-grade GenAI application (not a prototype) deployed on "
        "AWS Bedrock with full CBS integration. During the live demonstration, the evaluator can:\n"
        "- Input any borrower ID → system pulls live financial data from CBS/CRM in real-time\n"
        "- Watch the LLM (Claude 3.5 Sonnet via Bedrock) draft a full credit note in 45-60 seconds\n"
        "- Edit the draft with the human-in-loop validation interface\n"
        "- See the risk narrative and compliance checklist auto-generated\n"
        "Technical depth shown: RAG pipeline source code (Python/LangChain), "
        "Bedrock prompt templates, OpenSearch vector queries, Step Functions workflow diagram. "
        "UI is designed for credit analysts: role-based access, audit trail, draft versioning. "
        "p50 response latency: 1.8 seconds. Currently serving 1,800 daily active users.",
    )
    add_para(
        doc,
        "Demo System 2 — CASA Onboarding Document Validator (directly equivalent to PNB use case):\n"
        "Current deployment: Live at Punjab and Sind Bank since January 2025. 1,200+ branch users. "
        "This is a production Agentic AI system (not a prototype) on AWS performing document "
        "scrutiny, OCR, cross-validation, and structured output. During the live demonstration:\n"
        "- Upload any Account Opening Form + KYC documents → system classifies each document\n"
        "- Watch the agent cross-validate PAN vs Aadhaar vs Board Resolution fields in real-time\n"
        "- See structured JSON output with document status, missing fields, inconsistencies\n"
        "- Review the immutable audit trail of all AI decisions\n"
        "Technical depth: AWS Textract OCR pipeline, Bedrock Agents orchestration code, "
        "CKYC/PAN/GSTN integration APIs, validation rule engine. "
        "UI designed for branch officers: bilingual (Hindi/English), WCAG 2.1 compliant. "
        "p50 response latency: 2.1 seconds. Processing 800+ account opening forms daily.",
    )

    doc.add_page_break()

    # ── Section 7: Compliance Summary ─────────────────────────────────────
    add_heading(doc, "7. Technical Evaluation Compliance Summary", 1)
    add_para(
        doc,
        "The following table summarises TechNova's self-assessed marks against each "
        "RFP evaluation criterion. Bank reserves the right to verify and adjust scores.",
        italic=True,
    )
    add_table(
        doc,
        ["Category", "Criterion / Sub-Criterion", "Max Marks", "Claimed Marks", "Evidence"],
        [
            ["A: GenAI Delivery Capability", "Sub-1.a: GenAI Experience (12+ production use cases → 20 marks tier)", "20", "20", "Annexure-4 series (12 performance certs)"],
            ["A: GenAI Delivery Capability", "Sub-1.b: BFSI GenAI Experience (2 BFSI use cases → 6 marks tier)", "10", "6", "Annexure-4A to 4B (2 bank client certs)"],
            ["A: GenAI Delivery Capability", "Sub-1.c: Scale (100–999 users tier → 6 marks)", "10", "6", "Annexure-4 (user scale certificates)"],
            ["A: GenAI Delivery Capability", "Sub-2.a: Banking Team (14 members with 3+ yrs banking exp → 10 marks tier)", "10", "10", "Resumes and banking project evidence enclosed"],
            ["A: GenAI Delivery Capability", "Sub-2.b: Cloud Certs (5/14 = 35.7% with 2+ certs; 50% threshold for 1 cert → 3 marks)", "5", "3", "Cloud certification copies enclosed"],
            ["A TOTAL", "", "55", "45", "≥38.5 required; 45 claimed (81.8%)"],
            ["B: CSP Capabilities", "Criterion 4: CSP Platform (LLM 4 + VectorDB 2 + GPU 2 + RespAI 2 = 10)", "10", "10", "AWS service documentation enclosed"],
            ["B: CSP Capabilities", "Criterion 5: CSP Implementations (11 on AWS → 10+ tier = 8 marks)", "10", "8", "11 client references / SA undertaking"],
            ["B TOTAL", "", "20", "18", "≥14 required; 18 claimed (90%)"],
            ["C: Presentation & Demo", "Sub-6.a: Technical Presentation (live, 60 min, committee scored)", "15", "15", "Committed to live presentation"],
            ["C: Presentation & Demo", "Sub-6.b: Live Demo (2 live use cases, no pre-recorded video)", "10", "10", "Committed to 100% live interactive demo"],
            ["C TOTAL", "", "25", "25", "≥17.5 required; 25 claimed"],
            ["GRAND TOTAL", "", "100", "88", "≥70 required (aggregate); ≥70% each category"],
        ],
        col_widths=[1.8, 3.0, 0.8, 0.8, 2.2],
    )

    doc.add_paragraph()
    add_para(
        doc,
        "TechNova AI Solutions Pvt. Ltd. confirms full compliance with all mandatory eligibility "
        "criteria and self-assesses 88/100 marks in the Technical Evaluation. We acknowledge "
        "that 2 BFSI deployments and medium-scale implementation experience (100–999 users) "
        "place us in the respective scoring tiers, and we look forward to demonstrating our "
        "GenAI capabilities to the PNB evaluation committee.",
        bold=True,
    )

    doc.save("PNB_Vendor_PASS.docx")
    print("Created: PNB_Vendor_PASS.docx")


# ─── FAILING BID: QuickBuild Tech Pvt. Ltd. ───────────────────────────────

def create_fail_bid():
    doc = Document()

    # Title
    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title.add_run("TECHNICAL BID")
    run.bold = True
    run.font.size = Pt(16)
    run.font.color.rgb = RGBColor(0x7F, 0x00, 0x00)

    subtitle = doc.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run2 = subtitle.add_run(
        "RFP for Engagement of Implementation Partner for GenAI Use Cases\n"
        "Punjab National Bank"
    )
    run2.font.size = Pt(11)

    doc.add_paragraph()
    vendor_info = doc.add_paragraph()
    vendor_info.alignment = WD_ALIGN_PARAGRAPH.CENTER
    vi = vendor_info.add_run("Submitted by: QuickBuild Tech Pvt. Ltd.\nDate: June 2026")
    vi.bold = True
    vi.font.size = Pt(12)

    doc.add_page_break()

    # ── Section 1: Company Overview ───────────────────────────────────────
    add_heading(doc, "1. Company Overview", 1)
    add_para(
        doc,
        "QuickBuild Tech Pvt. Ltd. is a technology company offering software development "
        "and AI consulting services. We are pleased to submit our bid for the PNB GenAI RFP."
    )
    add_table(
        doc,
        ["Parameter", "Details"],
        [
            ["Company Name", "QuickBuild Tech Pvt. Ltd."],
            ["Date of Incorporation", "January 15, 2024 (2 years as on RFP date)"],
            ["GST Registration", "GSTIN: 07ABCQB9012D1ZM"],
            ["PAN", "ABCQB9012D"],
            ["Annual Turnover FY 2022-23", "Rs. 2.1 Crores"],
            ["Annual Turnover FY 2023-24", "Rs. 8.5 Crores"],
            ["Annual Turnover FY 2024-25", "Rs. 14.2 Crores"],
            ["Average Annual Turnover (3 FYs)", "Rs. 8.3 Crores"],
            ["Full-Time Employees", "22 (total)"],
            ["Full-Time AI/GenAI Employees", "4"],
        ],
        col_widths=[2.5, 4.0],
    )

    # ── Section 2: GenAI Experience ────────────────────────────────────────
    add_heading(doc, "2. GenAI Experience and Capability", 1)
    add_para(
        doc,
        "QuickBuild Tech has worked on several AI and machine learning projects. "
        "We have completed 2 GenAI projects for clients, one chatbot POC for a retail "
        "company and one document summarization tool for an IT services firm. "
        "We believe GenAI technology is the future and are eager to grow in this space.",
    )
    add_table(
        doc,
        ["Project", "Client", "Type", "Status"],
        [
            ["Customer Chatbot", "Retail Client", "POC / Prototype", "Completed 2024"],
            ["Document Summarizer", "IT Firm", "MVP (not in production)", "Completed 2025"],
        ],
        col_widths=[2.0, 1.8, 1.8, 2.0],
    )
    add_para(
        doc,
        "Note: Neither project is currently deployed in a production environment with active users. "
        "Both were exploratory prototypes for internal evaluation by the respective clients."
    )

    # ── Section 3: Team Information ────────────────────────────────────────
    add_heading(doc, "3. Team Composition", 1)
    add_para(
        doc,
        "Our team for this project will consist of dedicated professionals. "
        "We have identified the following team members for deployment:"
    )
    add_table(
        doc,
        ["Role", "Experience", "Banking Domain Exp"],
        [
            ["Lead Developer", "5 years in Python/AI", "No banking experience"],
            ["ML Engineer", "3 years in ML/NLP", "6 months as an intern at an NBFC"],
            ["Cloud Engineer", "2 years in AWS basics", "No banking experience"],
            ["DevOps Engineer", "2 years", "No banking experience"],
            ["Business Analyst", "1 year", "None relevant"],
        ],
        col_widths=[1.8, 2.5, 2.0],
    )
    add_para(
        doc,
        "Most of our team members are enthusiastic about banking domain and are willing to learn. "
        "We do not currently have team members with 3+ years of specific banking CBS, credit, "
        "KYC/AML experience, but we are confident we can adapt quickly."
    )

    # ── Section 4: CSP Choice ──────────────────────────────────────────────
    add_heading(doc, "4. Cloud Service Provider", 1)
    add_para(
        doc,
        "We plan to use a combination of cloud providers including DigitalOcean and Oracle Cloud "
        "for cost-effective hosting. For AI model access, we may use third-party APIs such as "
        "OpenAI API endpoints. "
        "Note: Our proposed CSP (DigitalOcean) is not currently empaneled with MeitY, but we "
        "believe the data security offered is adequate for banking applications. "
        "We are investigating MeitY empanelment and may switch to an empaneled provider later. "
        "Our CSP does not have India-specific sovereign data centres; servers are in Singapore. "
        "We do not currently have SOC2 Type II or ISO27017/27018 compliance documentation for "
        "the proposed cloud provider, but we are in the process of obtaining these."
    )

    # ── Section 5: Presentation ────────────────────────────────────────────
    add_heading(doc, "5. Technical Presentation and Demonstration", 1)
    add_para(
        doc,
        "We have prepared a detailed PowerPoint presentation showcasing our AI capabilities. "
        "For the demonstration component, we plan to show pre-recorded video walkthroughs of "
        "our previous chatbot and document summarizer projects. "
        "We believe pre-recorded demos provide a more polished experience than live demonstrations "
        "and reduce the risk of technical issues during the evaluation session. "
        "We can also show some screenshots of sample GenAI outputs if required."
    )

    # ── Section 6: Why QuickBuild ──────────────────────────────────────────
    add_heading(doc, "6. Why Choose QuickBuild Tech", 1)
    add_para(
        doc,
        "Although we are a newer company (incorporated in 2024), we bring fresh perspectives "
        "and innovative approaches to AI development. Our cost-effective pricing model means "
        "PNB will get excellent value for money. Our team is highly motivated and we are "
        "committed to delivering quality work. We look forward to growing with PNB's GenAI journey."
    )

    doc.save("PNB_Vendor_FAIL.docx")
    print("Created: PNB_Vendor_FAIL.docx")


# ─── Entry point ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    create_pass_bid()
    create_fail_bid()
    print("\nDone. Both vendor bid files created in current directory.")
    print("  PNB_Vendor_PASS.docx — TechNova AI Solutions (should PASS: 100/100)")
    print("  PNB_Vendor_FAIL.docx — QuickBuild Tech (should FAIL: fails eligibility + low scores)")
    print("\nFailure reasons for QuickBuild:")
    print("  - Company only 2 years old (fails ≥5 year requirement)")
    print("  - Turnover avg Rs.8.3 Crores (fails ≥50 Crore requirement)")
    print("  - Only 4 GenAI employees (fails ≥10 requirement)")
    print("  - 0 production GenAI use cases (fails ≥3 requirement; only POCs)")
    print("  - 0 BFSI GenAI experience")
    print("  - Only 1 team member with partial banking experience")
    print("  - CSP not MeitY empaneled, not India datacentre, no ISO27001/SOC2")
    print("  - Plans pre-recorded video demo (explicitly disqualifying per RFP)")
    print("  - Category A: ~0/55 (0%) — fails 70% minimum")
    print("  - Category B: ~0/20 (0%) — fails 70% minimum")
    print("  - Category C: 0/25 (pre-recorded = 0 marks per RFP CRITICAL NOTE)")
