"""
Create demo RFP and two vendor bid documents for testing the evaluation pipeline.
Domain: AI-Powered Citizen Services Platform for a State e-Governance Authority
"""

from docx import Document
from docx.shared import Pt, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH


def heading(doc, text, level=1):
    p = doc.add_heading(text, level=level)
    return p


def para(doc, text, bold=False):
    p = doc.add_paragraph(text)
    if bold:
        for run in p.runs:
            run.bold = True
    return p


def table_row(table, cells):
    row = table.add_row()
    for i, val in enumerate(cells):
        row.cells[i].text = str(val)
    return row


# ---------------------------------------------------------------------------
# 1. RFP DOCUMENT
# ---------------------------------------------------------------------------

def create_rfp():
    doc = Document()

    heading(doc, "RAJASTHAN STATE e-GOVERNANCE AUTHORITY (RSEGA)", 1)
    heading(doc, "REQUEST FOR PROPOSAL (RFP)", 1)
    heading(doc, "FOR IMPLEMENTATION OF AI-POWERED CITIZEN SERVICES PLATFORM (CSP)", 1)

    para(doc, "RFP Reference No.: RSEGA/ICT/AI-CSP/2026/01")
    para(doc, "Date of Issue: 10 June 2026")
    para(doc, "Last Date for Submission: 10 July 2026")
    para(doc, "")

    heading(doc, "PART A — INTRODUCTION AND BACKGROUND", 2)
    para(doc,
        "The Rajasthan State e-Governance Authority (RSEGA) invites sealed bids from experienced, "
        "qualified, and financially sound firms for the Design, Development, and Operationalisation "
        "of an AI-Powered Citizen Services Platform (CSP). The platform shall integrate AI/ML-driven "
        "natural language processing, automated grievance routing, predictive analytics, and a unified "
        "citizen dashboard accessible across web and mobile channels. The successful implementation "
        "partner will work closely with RSEGA to deliver production-ready AI use cases that measurably "
        "improve citizen satisfaction and service delivery timelines."
    )

    heading(doc, "PART B — MANDATORY DOCUMENTS TO BE SUBMITTED WITH BID", 2)
    para(doc,
        "The following mandatory documents must be submitted along with the technical bid. "
        "Bids not accompanied by these documents shall be summarily rejected."
    )
    doc.add_paragraph("Submission of Earnest Money Deposit (EMD) of Rs. 25 Lakh by Demand Draft or Bank Guarantee in favour of RSEGA payable at Jaipur.", style="List Number")
    doc.add_paragraph("Submission of Certificate of Incorporation showing registration of the bidding entity in India.", style="List Number")
    doc.add_paragraph("Submission of self-declaration of non-blacklisting on company letterhead, signed by the authorised signatory.", style="List Number")
    doc.add_paragraph("Submission of Integrity Pact as per Annexure-1, duly signed.", style="List Number")
    doc.add_paragraph("Submission of Non-Disclosure Agreement (NDA) as per Annexure-2, duly signed.", style="List Number")
    doc.add_paragraph("Submission of Power of Attorney in favour of the authorised signatory.", style="List Number")
    doc.add_paragraph("Submission of audited financial statements for the last 3 financial years certified by a Statutory Auditor.", style="List Number")

    heading(doc, "PART C — TECHNICAL EVALUATION CRITERIA AND SCORING", 2)
    para(doc,
        "The technical bid will be evaluated on the criteria described below. Marks allocated to "
        "categories are defined in the tables that follow. The minimum qualifying marks: Bidder must "
        "score 70% in each category separately and 70% overall to be declared technically qualified."
    )

    para(doc,
        "Scoring Summary: Total marks = 100. Overall pass threshold = 70 marks (70%). "
        "Category minimums: each category has a minimum of 70% in each category separately. "
        "Bids that score below 70% in any single category will not be technically qualified, "
        "irrespective of the overall score."
    )

    # ── Category A ──────────────────────────────────────────────────────────
    heading(doc, "Category A: Bidder AI Delivery Capability — Maximum Marks: 50 | Weight: 50%", 3)
    para(doc,
        "This category assesses the organisation's demonstrated capability to deliver production "
        "AI/ML systems at scale. Marks allocated to Category A criteria are detailed below."
    )

    heading(doc, "Criterion 1: AI/ML Use Cases Delivered — 35 Marks", 4)

    para(doc, "Sub-Criterion 1.a: Production AI/ML Deployments in Organisation — Maximum marks: 20")
    t = doc.add_table(rows=1, cols=2)
    t.style = "Table Grid"
    t.rows[0].cells[0].text = "Qualifying Condition"
    t.rows[0].cells[1].text = "Marks Awarded"
    for row in [
        ("8 or more production AI/ML use cases deployed (not POCs/prototypes)", "20"),
        ("5 to 7 production AI/ML deployments", "14"),
        ("3 to 4 production AI/ML deployments", "8"),
    ]:
        table_row(t, row)
    para(doc, "")

    para(doc, "Sub-Criterion 1.b: Government / Public-Sector AI Experience — Maximum marks: 15")
    t = doc.add_table(rows=1, cols=2)
    t.style = "Table Grid"
    t.rows[0].cells[0].text = "Qualifying Condition"
    t.rows[0].cells[1].text = "Marks Awarded"
    for row in [
        ("5 or more production AI projects for Central/State Govt or PSU clients", "15"),
        ("3 to 4 such projects", "10"),
        ("1 to 2 such projects", "5"),
    ]:
        table_row(t, row)
    para(doc, "")

    heading(doc, "Criterion 2: Team Expertise and Profile — 15 Marks", 4)

    para(doc, "Sub-Criterion 2.a: e-Governance Domain Expertise — Maximum marks: 15")
    t = doc.add_table(rows=1, cols=2)
    t.style = "Table Grid"
    t.rows[0].cells[0].text = "Qualifying Condition"
    t.rows[0].cells[1].text = "Marks Awarded"
    for row in [
        ("12 or more proposed team members with 3+ years e-Governance IT project experience", "15"),
        ("8 to 11 team members meeting the criterion", "10"),
        ("4 to 7 team members meeting the criterion", "5"),
    ]:
        table_row(t, row)
    para(doc, "")

    # ── Category B ──────────────────────────────────────────────────────────
    heading(doc, "Category B: Cloud Platform and Compliance — Maximum Marks: 30 | Weight: 30%", 3)
    para(doc,
        "This category evaluates the cloud infrastructure proposed, security compliance posture, "
        "and financial stability of the bidder. Maximum marks for Category B: 30 marks."
    )

    para(doc, "Sub-Criterion 3.a: NIC/MeitY Empanelled Cloud Service Provider — Maximum marks: 15")
    t = doc.add_table(rows=1, cols=2)
    t.style = "Table Grid"
    t.rows[0].cells[0].text = "Qualifying Condition"
    t.rows[0].cells[1].text = "Marks Awarded"
    for row in [
        ("Proposed CSP is NIC/MeitY empanelled AND operates sovereign India data centres", "15"),
        ("CSP is MeitY empanelled but without dedicated India-sovereign data centres", "8"),
    ]:
        table_row(t, row)
    para(doc, "")

    para(doc, "Sub-Criterion 3.b: Compliance and Security Certifications — Maximum marks: 15")
    t = doc.add_table(rows=1, cols=2)
    t.style = "Table Grid"
    t.rows[0].cells[0].text = "Qualifying Condition"
    t.rows[0].cells[1].text = "Marks Awarded"
    for row in [
        ("CMMI Level 5 + ISO 27001 + STQC certified", "15"),
        ("CMMI Level 3 + ISO 27001", "9"),
        ("ISO 27001 only", "5"),
    ]:
        table_row(t, row)
    para(doc, "")

    # ── Category C ──────────────────────────────────────────────────────────
    heading(doc, "Category C: Technical Presentation and Live Demonstration — Maximum Marks: 20 | Weight: 20%", 3)
    para(doc,
        "Shortlisted bidders shall be invited for a Technical Presentation and Live Demonstration "
        "before the RSEGA Evaluation Committee. Evaluation at bid stage will be based on the "
        "vendor's demonstration plan and evidence of live systems."
    )

    para(doc, "Sub-Criterion 4.a: Technical Presentation — Maximum marks: 10")
    para(doc,
        "Evaluated on clarity of solution architecture, alignment to RSEGA requirements, "
        "AI model governance, data privacy design, and implementation roadmap. "
        "Full marks (10) awarded for a detailed presentation backed by live system evidence. "
        "Partial marks (5) for a plan with limited system evidence."
    )

    para(doc, "Sub-Criterion 4.b: Live Platform Demonstration — Maximum marks: 10")
    para(doc,
        "The vendor must conduct a live demonstration of their AI platform or an analogous "
        "deployed system. Full marks (10) awarded if a live working system is demonstrated "
        "with vendor commitment and evidence of existing live deployments. "
        "Partial marks (5) if vendor commits to a live demo with supporting capability evidence."
    )

    heading(doc, "PART D — FINANCIAL BID", 2)
    para(doc,
        "The financial bid shall be submitted in a separate sealed envelope. Financial bids of "
        "only technically qualified vendors (those scoring 70% overall and 70% in each category "
        "separately) will be opened. The L1 (lowest bid) among technically qualified vendors "
        "will be awarded the contract."
    )

    heading(doc, "PART E — GENERAL CONDITIONS", 2)
    para(doc,
        "RSEGA reserves the right to accept or reject any bid without assigning reasons. "
        "All queries must be submitted in writing before the pre-bid meeting date. "
        "The decision of the RSEGA Evaluation Committee shall be final and binding."
    )

    path = "RSEGA_AI_CSP_RFP_2026.docx"
    doc.save(path)
    print(f"Saved: {path}")


# ---------------------------------------------------------------------------
# 2. PASSING VENDOR BID — GovTech Systems Pvt. Ltd.
# ---------------------------------------------------------------------------

def create_pass_bid():
    doc = Document()

    heading(doc, "TECHNICAL BID DOCUMENT", 1)
    para(doc, "RFP for AI-Powered Citizen Services Platform (CSP)")
    para(doc, "Rajasthan State e-Governance Authority (RSEGA)")
    para(doc, "RFP Reference: RSEGA/ICT/AI-CSP/2026/01")
    para(doc, "")
    para(doc, "Submitted by: GovTech Systems Pvt. Ltd.")
    para(doc, "Date: July 2026")
    para(doc, "")

    heading(doc, "1. Executive Summary", 2)
    para(doc,
        "GovTech Systems Pvt. Ltd. is pleased to submit this Technical Bid in response to the "
        "RSEGA RFP for the AI-Powered Citizen Services Platform. GovTech has been delivering "
        "enterprise AI and e-Governance solutions since 2013 and is incorporated in India as of "
        "April 2013 — over 13 years of continuous operation. We have delivered 9 production "
        "AI/ML use cases across government and enterprise clients, including 5 projects specifically "
        "for Central and State Government or PSU bodies. Our proposed Cloud Service Provider is "
        "NIC Cloud (National Informatics Centre), which is NIC/MeitY empanelled and operates "
        "sovereign data centres exclusively within India (Delhi and Pune NIC DCs). "
        "We hold CMMI Level 5 and ISO 27001:2022 certifications. Our average annual turnover for "
        "FY 2023-24, 2024-25, and 2025-26 is ₹185 Crore. We confirm submission of all mandatory "
        "documents including EMD, Integrity Pact, NDA, Power of Attorney, and all Annexures. "
        "We are not blacklisted by any government body; a self-declaration is enclosed."
    )

    heading(doc, "2. Company Overview", 2)
    para(doc,
        "GovTech Systems Pvt. Ltd. was incorporated in India on 14 April 2013 under the Companies "
        "Act (CIN: U72900RJ2013PTC044721). As of the submission date we have been registered for "
        "over 13 years, well exceeding the 5-year minimum requirement. The company employs 420+ "
        "professionals across offices in Jaipur, Bengaluru, and Delhi. We have no pending litigation "
        "that threatens solvency; a litigation-free certificate from our Statutory Auditor is "
        "enclosed as Annexure-3."
    )

    heading(doc, "3. Mandatory Eligibility Compliance", 2)
    t = doc.add_table(rows=1, cols=3)
    t.style = "Table Grid"
    t.rows[0].cells[0].text = "Mandatory Criterion"
    t.rows[0].cells[1].text = "Status"
    t.rows[0].cells[2].text = "Evidence / Annexure"
    for row in [
        ("Registered in India ≥ 5 years", "Compliant — 13+ years", "Certificate of Incorporation (Annexure-1)"),
        ("Not blacklisted by any Govt / PSU", "Compliant", "Self-Declaration (Annexure-2)"),
        ("Proposed CSP is NIC/MeitY empanelled", "Compliant — NIC Cloud", "NIC Empanelment Certificate (Annexure-4)"),
        ("EMD ₹25 Lakh submitted", "Compliant", "DD No. SBI/2026/RSEGA/EMD enclosed"),
        ("Performance Bank Guarantee", "Agreed — to be submitted within 15 days of award", "Undertaking (Annexure-5)"),
    ]:
        table_row(t, row)
    para(doc, "")

    heading(doc, "4. Category A: Bidder AI Delivery Capability", 2)
    para(doc,
        "GovTech addresses each sub-criterion under Category A below with specific evidence. "
        "Our self-assessed marks for Category A: 50 out of 50."
    )

    heading(doc, "4.1 Sub-Criterion 1.a: Production AI/ML Deployments — Maximum 20 Marks", 3)
    para(doc,
        "RFP Scoring Tier: 8 or more production AI/ML use cases = 20 marks; 5-7 = 14 marks; 3-4 = 8 marks."
    )
    para(doc,
        "GovTech has deployed 9 production AI/ML use cases for clients, all actively serving "
        "end-users in production environments (not POCs or prototypes). The 9 deployments include: "
        "(1) Grievance Auto-Routing Engine for Rajasthan Urban Development Authority — "
        "4,200 daily active citizens; (2) NLP-driven Query Resolution Bot for NSDL (Central Govt PSU) — "
        "12,000 registered users; (3) Predictive Maintenance AI for Rajasthan DISCOMS power grid — "
        "deployed across 9 districts; (4) Document OCR & Classification System for Rajasthan Revenue "
        "Department — processing 8,000 documents per day; (5) AI Fraud Detection for Rajasthan "
        "Cooperative Bank — 1,100 concurrent staff users; (6) Smart Traffic Analytics for Jaipur "
        "Smart City — real-time video AI on 220 camera feeds; (7) Chatbot for State Insurance & "
        "Provident Fund (SIPF) employee services — 18,500 registered users; (8) Land Record "
        "Verification AI for e-Dharti portal (Ministry of Rural Development) — 2.1 million "
        "records processed; (9) Crop Advisory AI for Rajasthan Agriculture Department — 95,000 "
        "farmer registrations. All 9 are in production with verifiable client certificates."
    )
    para(doc, "SELF-ASSESSED MARKS: 20 out of 20 (9 production deployments — highest tier: 8 or more).")

    heading(doc, "4.2 Sub-Criterion 1.b: Government / Public-Sector AI Experience — Maximum 15 Marks", 3)
    para(doc,
        "RFP Scoring Tier: 5 or more government/PSU AI projects = 15 marks; 3-4 = 10 marks; 1-2 = 5 marks."
    )
    para(doc,
        "Of the 9 production deployments listed above, the following 5 are specifically for "
        "Central/State Government or PSU clients: "
        "Project 1 (Rajasthan Urban Development Authority — State Govt), "
        "Project 2 (NSDL — Central Govt PSU), "
        "Project 4 (Rajasthan Revenue Department — State Govt), "
        "Project 8 (Ministry of Rural Development — Central Govt), "
        "Project 9 (Rajasthan Agriculture Department — State Govt). "
        "Each project has a government-issued completion certificate available for verification."
    )
    para(doc, "SELF-ASSESSED MARKS: 15 out of 15 (5 government/PSU AI projects — highest tier).")

    heading(doc, "4.3 Sub-Criterion 2.a: e-Governance Domain Team Expertise — Maximum 15 Marks", 3)
    para(doc,
        "RFP Scoring Tier: 12 or more team members with 3+ years e-Governance IT experience = 15 marks; "
        "8-11 = 10 marks; 4-7 = 5 marks."
    )
    para(doc,
        "GovTech will deploy a 20-member project team for this engagement. Of these, 14 members "
        "have 3 or more years of verified e-Governance IT project experience including work on "
        "NIC-hosted systems, State Data Centre integrations, UMANG platform interfaces, DigiLocker "
        "API implementations, and eDistrict deployments. CVs and government client references are "
        "provided in Annexure-8. All 14 qualifying team members are currently on GovTech payroll "
        "and available from Day 1 of the project."
    )
    para(doc, "SELF-ASSESSED MARKS: 15 out of 15 (14 qualifying members — highest tier: 12 or more).")

    heading(doc, "5. Category B: Cloud Platform and Compliance", 2)
    para(doc, "GovTech's self-assessed marks for Category B: 30 out of 30.")

    heading(doc, "5.1 Sub-Criterion 3.a: NIC/MeitY Empanelled Cloud Provider — Maximum 15 Marks", 3)
    para(doc,
        "RFP Scoring Tier: NIC/MeitY empanelled CSP with India sovereign data centres = 15 marks; "
        "MeitY empanelled without India-sovereign DC = 8 marks."
    )
    para(doc,
        "GovTech proposes NIC Cloud (National Informatics Centre Cloud Services) as the Cloud Service "
        "Provider for this engagement. NIC Cloud is NIC empanelled and MeitY approved. Data centres "
        "are located at NIC Delhi and NIC Pune — both physically within India and subject to Indian "
        "law. MeitY empanelment certificate reference: NIC-MeITY-2024-CLOUD-0078. All data "
        "residency, sovereignty, and RBI data localisation requirements are fully met. "
        "The NIC Cloud empanelment certificate is enclosed as Annexure-4."
    )
    para(doc, "SELF-ASSESSED MARKS: 15 out of 15 (NIC Cloud — highest tier: NIC/MeitY empanelled with India sovereign DC).")

    heading(doc, "5.2 Sub-Criterion 3.b: Compliance and Security Certifications — Maximum 15 Marks", 3)
    para(doc,
        "RFP Scoring Tier: CMMI Level 5 + ISO 27001 + STQC = 15 marks; CMMI 3 + ISO 27001 = 9 marks; ISO 27001 only = 5 marks."
    )
    para(doc,
        "GovTech holds the following active certifications: "
        "CMMI Level 5 (v2.0) — awarded by KPMG, valid through March 2027 (Certificate No. CMMI-L5-GTS-2025); "
        "ISO 27001:2022 — awarded by BSI Group, valid through August 2027 (Certificate No. IS 765432); "
        "STQC Software Testing Certification — STQC Certificate No. STQC/RJ/2025/AI-018. "
        "All three certificates are enclosed in Annexure-6."
    )
    para(doc, "SELF-ASSESSED MARKS: 15 out of 15 (CMMI L5 + ISO 27001 + STQC — highest tier).")

    heading(doc, "6. Category C: Technical Presentation and Live Demonstration", 2)
    para(doc,
        "GovTech confirms full participation in the Technical Presentation and Live Demonstration "
        "stage. Our self-assessed marks for Category C: 20 out of 20."
    )

    heading(doc, "6.1 Sub-Criterion 4.a: Technical Presentation — Maximum 10 Marks", 3)
    para(doc,
        "GovTech will deliver a comprehensive technical presentation covering: "
        "(a) Solution Architecture — microservices-based AI platform on NIC Cloud with separate "
        "inference, storage, and API gateway layers; (b) AI Model Governance — model versioning, "
        "bias monitoring, explainability reports aligned to MeitY AI Ethics Guidelines; "
        "(c) Data Privacy Design — field-level encryption, PII masking, DPDP Act compliance; "
        "(d) Integration Blueprint — REST API connectors to existing Rajasthan government systems "
        "(JanSunwai, SSO Rajasthan, Bhamashah); (e) Implementation Roadmap — phased delivery in "
        "12 months with monthly milestones. Presentation deck is provided as Annexure-9."
    )
    para(doc, "SELF-ASSESSED MARKS: 10 out of 10.")

    heading(doc, "6.2 Sub-Criterion 4.b: Live Platform Demonstration — Maximum 10 Marks", 3)
    para(doc,
        "GovTech will conduct a live (real-time, not pre-recorded) demonstration of our deployed "
        "Grievance Auto-Routing Engine currently serving Rajasthan Urban Development Authority. "
        "The live demo will showcase: NLP classification of citizen grievance text in real time, "
        "automated department routing logic, escalation workflows, and analytics dashboard. "
        "We will demonstrate using the production system with prior written permission from RUDA "
        "(letter enclosed as Annexure-10). We also have live access to our AI Studio platform "
        "on NIC Cloud for a real-time chatbot and OCR pipeline demonstration."
    )
    para(doc, "SELF-ASSESSED MARKS: 10 out of 10.")

    heading(doc, "7. Summary of Self-Assessed Marks", 2)
    t = doc.add_table(rows=1, cols=4)
    t.style = "Table Grid"
    t.rows[0].cells[0].text = "Category / Sub-Criterion"
    t.rows[0].cells[1].text = "Max Marks"
    t.rows[0].cells[2].text = "Self-Assessed"
    t.rows[0].cells[3].text = "Tier"
    for row in [
        ("Sub-Criterion 1.a: Production AI/ML Deployments", "20", "20", "Highest (9 deployments)"),
        ("Sub-Criterion 1.b: Government/PSU AI Experience", "15", "15", "Highest (5 govt projects)"),
        ("Sub-Criterion 2.a: e-Governance Team Expertise", "15", "15", "Highest (14 members)"),
        ("Category A Total", "50", "50", "100%"),
        ("Sub-Criterion 3.a: NIC/MeitY Empanelled CSP", "15", "15", "Highest (NIC Cloud)"),
        ("Sub-Criterion 3.b: Compliance Certifications", "15", "15", "Highest (CMMI5+ISO27001+STQC)"),
        ("Category B Total", "30", "30", "100%"),
        ("Sub-Criterion 4.a: Technical Presentation", "10", "10", "Met"),
        ("Sub-Criterion 4.b: Live Demo", "10", "10", "Met"),
        ("Category C Total", "20", "20", "100%"),
        ("GRAND TOTAL", "100", "100", "100%"),
    ]:
        table_row(t, row)

    path = "GovTech_Systems_PASS_Bid.docx"
    doc.save(path)
    print(f"Saved: {path}")


# ---------------------------------------------------------------------------
# 3. FAILING VENDOR BID — SoftByte Innovations Pvt. Ltd.
# ---------------------------------------------------------------------------

def create_fail_bid():
    doc = Document()

    heading(doc, "TECHNICAL BID", 1)
    para(doc, "RFP for AI-Powered Citizen Services Platform")
    para(doc, "Rajasthan State e-Governance Authority (RSEGA)")
    para(doc, "")
    para(doc, "Submitted by: SoftByte Innovations Pvt. Ltd.")
    para(doc, "Date: July 2026")
    para(doc, "")

    heading(doc, "1. About SoftByte Innovations", 2)
    para(doc,
        "SoftByte Innovations Pvt. Ltd. is a growing IT and digital solutions company incorporated "
        "in India in March 2023. We specialise in web application development, mobile apps, and "
        "emerging technologies including Artificial Intelligence. Although we are a relatively "
        "new company (approximately 3 years old), we are passionate about the potential of AI "
        "for citizen services and believe our fresh approach offers innovation that larger, "
        "more traditional vendors cannot match."
    )

    heading(doc, "1.1 Mandatory Documents Submitted", 3)
    para(doc,
        "We are enclosing all mandatory documents with this bid: "
        "Earnest Money Deposit (EMD) of Rs. 25 Lakh by Demand Draft (DD No. PNB/2026/SB/001) enclosed. "
        "Certificate of Incorporation (enclosed as Annexure-1). "
        "Self-declaration of non-blacklisting on company letterhead (enclosed as Annexure-2). "
        "Signed Integrity Pact as per Annexure format (enclosed as Annexure-3). "
        "Signed Non-Disclosure Agreement (enclosed as Annexure-4). "
        "Power of Attorney in favour of our authorised signatory (enclosed as Annexure-5). "
        "Audited financial statements for FY 2023-24 and FY 2024-25 (enclosed as Annexure-6)."
    )

    heading(doc, "2. Our AI and Technology Experience", 2)
    para(doc,
        "SoftByte has worked on a number of AI and machine learning projects since our founding. "
        "We have completed 2 AI projects for clients: "
        "(1) A chatbot prototype built for a private retail chain to answer customer FAQs — "
        "this was an internal pilot and has not yet been launched in production; "
        "(2) A document classification tool for a mid-size IT services company — "
        "this was a proof-of-concept that the client evaluated but did not deploy. "
        "Neither project is currently running in a production environment with active end-users. "
        "We are actively seeking our first production government AI deployment and believe "
        "this RSEGA project would be an excellent first such engagement."
    )

    heading(doc, "3. Government and Public Sector Experience", 2)
    para(doc,
        "SoftByte has limited direct experience with Central or State Government AI projects. "
        "One of our co-founders previously worked for a larger IT firm that delivered an e-Municipality "
        "web portal for a district municipal council; however, that project was not under SoftByte's "
        "name and was a general web application, not an AI project. "
        "We do not currently have any government or PSU AI project completion certificates to submit."
    )

    heading(doc, "4. Team Composition", 2)
    para(doc,
        "SoftByte will deploy a 6-member team for this engagement. Our team consists of: "
        "2 software developers (2 years experience each in web development), "
        "1 data scientist (fresher, 8 months experience with ML libraries), "
        "1 project coordinator (3 years general IT project management, no e-Governance background), "
        "1 UI/UX designer, and 1 business analyst. "
        "We acknowledge that our team currently has 0 members with 3+ years of specific "
        "e-Governance IT project experience. We plan to hire or engage consultants with "
        "e-Governance experience once the contract is awarded."
    )

    heading(doc, "5. Cloud Infrastructure", 2)
    para(doc,
        "For cost efficiency and flexibility, SoftByte proposes to use DigitalOcean as our "
        "primary Cloud Service Provider. DigitalOcean offers competitive pricing, easy-to-use "
        "APIs, and good uptime guarantees. We acknowledge that DigitalOcean is not currently "
        "empanelled with NIC or MeitY, and its data centres for our proposed configuration are "
        "located in Singapore. We believe the security controls offered are adequate for the "
        "proposed use case and plan to apply for MeitY empanelment consideration in the future. "
        "As a fallback, we may consider using Google Cloud Platform (GCP) which has some Indian "
        "data centre presence, though we have not yet finalised this choice."
    )

    heading(doc, "6. Certifications and Compliance", 2)
    para(doc,
        "SoftByte is in the process of obtaining ISO 27001 certification; the audit is scheduled "
        "for Q3 2026. We do not currently hold ISO 27001, CMMI, or STQC certifications. "
        "We are committed to obtaining these certifications and can provide a timeline upon request."
    )

    heading(doc, "7. Financial Information", 2)
    para(doc,
        "SoftByte is a young company and our revenues are growing rapidly. Our annual turnover "
        "for FY 2023-24 was ₹1.8 Crore (first partial year of operations), FY 2024-25 was "
        "₹4.2 Crore, and FY 2025-26 (projected, unaudited) is approximately ₹9 Crore. "
        "We recognise this is below the thresholds mentioned in the RFP scoring criteria; "
        "however, we are confident in our team's technical capabilities to deliver the project "
        "within budget despite our current scale."
    )

    heading(doc, "8. Technical Presentation and Demonstration", 2)
    para(doc,
        "SoftByte has prepared a presentation covering our proposed approach to the RSEGA "
        "Citizen Services Platform. For the demonstration component, we plan to show "
        "pre-recorded video walkthroughs of our two AI prototype projects (the retail chatbot "
        "and the document classifier). We believe pre-recorded demonstrations provide a more "
        "controlled and professional experience. We can also show screenshots of sample AI "
        "outputs and architecture diagrams. We do not currently have a live production AI "
        "system to demonstrate but can set up a sandbox demo environment if given 2 weeks "
        "notice prior to the evaluation session."
    )

    heading(doc, "9. Why RSEGA Should Choose SoftByte", 2)
    para(doc,
        "We offer extremely competitive pricing — our bid will be significantly lower than "
        "established vendors. Our young and agile team brings fresh thinking unconstrained "
        "by legacy approaches. We are highly motivated to prove ourselves on this flagship "
        "project and will dedicate our best resources. We are open to milestone-based payments "
        "with penalties for delays, demonstrating our confidence in delivery. "
        "We request RSEGA to consider relaxing the experience and certification requirements "
        "given our competitive pricing and commitment."
    )

    path = "SoftByte_Innovations_FAIL_Bid.docx"
    doc.save(path)
    print(f"Saved: {path}")


if __name__ == "__main__":
    create_rfp()
    create_pass_bid()
    create_fail_bid()
    print("All documents created successfully.")
