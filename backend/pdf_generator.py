from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.units import inch
from datetime import datetime


def generate_pdf_report(report_id, transcript, report_data, model_id=None):
    """Generate PDF report with checklist and evidence"""
    from pathlib import Path
    reports_dir = Path(__file__).parent / "reports"
    reports_dir.mkdir(exist_ok=True)
    
    filename = reports_dir / f"{report_id}.pdf"
    doc = SimpleDocTemplate(str(filename), pagesize=letter)
    story = []
    styles = getSampleStyleSheet()
    
    # Title
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#1a56db'),
        spaceAfter=30
    )
    story.append(Paragraph("OSCE Evaluation Report", title_style))
    
    # Metadata
    meta_style = styles['Normal']
    
    # Get source file from report_data if available
    source_file = report_data.get('source_file')
    if source_file:
        story.append(Paragraph(f"<b>Source File:</b> {source_file}", meta_style))
    
    story.append(Paragraph(f"<b>Report ID:</b> {report_id}", meta_style))
    story.append(Paragraph(f"<b>Generated:</b> {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC", meta_style))
    if model_id:
        story.append(Paragraph(f"<b>AI Model:</b> {model_id}", meta_style))
    story.append(Spacer(1, 0.3*inch))
    
    # Checklist Section
    story.append(Paragraph("<b>Critical Data Gathering & Exam Checklist</b>", styles['Heading2']))
    story.append(Spacer(1, 0.2*inch))
    
    checklist = report_data.get('checklist', [])
    
    # Create checklist table with wrapped text
    item_style = ParagraphStyle(
        'Item',
        parent=styles['Normal'],
        fontSize=8,
        leading=10
    )
    
    evidence_style = ParagraphStyle(
        'Evidence',
        parent=styles['Normal'],
        fontSize=8,
        leading=10
    )
    
    table_data = [["#", "Item", "Status", "Evidence"]]
    for idx, item in enumerate(checklist, 1):
        # Check if item has sub-items
        if item.get('has_subitems') and item.get('subitems'):
            # Add parent item with overall status
            overall_status = item.get('overall_status', 'Not Sure')
            if overall_status == 'Yes':
                status_display = "✓ Yes"
            elif overall_status == 'No':
                status_display = "✗ No"
            else:
                status_display = "Not Sure"
            
            item_text = Paragraph(f"<b>{item['item']}</b>", item_style)
            threshold_text = Paragraph(f"<i>{item.get('threshold', '')}</i>", evidence_style)
            table_data.append([str(idx), item_text, status_display, threshold_text])
            
            # Add sub-items
            import re
            for sub_idx, sub in enumerate(item['subitems'], 1):
                # Extract letter notation and text from sub-item name (e.g., "2a" and "Lightheadedness" from "2a. Lightheadedness")
                sub_item_name = sub['item']
                match = re.match(r'^(\d+[a-z])\.\s*(.+)$', sub_item_name)
                if match:
                    sub_id = match.group(1)
                    sub_text = match.group(2)
                else:
                    # Fallback: use parent index + letter
                    sub_id = f"{idx}{chr(96 + sub_idx)}"
                    sub_text = sub_item_name
                
                sub_status = sub['status']
                if sub_status == 'Yes':
                    sub_status_display = "✓ Yes"
                elif sub_status == 'No':
                    sub_status_display = "✗ No"
                else:
                    sub_status_display = "Not Sure"
                
                sub_item_text = Paragraph(f"  {sub_text}", item_style)
                
                sub_evidence = sub.get('evidence', '')
                sub_timestamp = sub.get('timestamp')
                
                if sub_evidence:
                    if sub_timestamp:
                        sub_evidence_text = f"[{sub_timestamp}] {sub_evidence}"
                    else:
                        sub_evidence_text = sub_evidence
                    sub_evidence_para = Paragraph(sub_evidence_text, evidence_style)
                else:
                    sub_evidence_para = Paragraph("-", evidence_style)
                
                table_data.append([sub_id, sub_item_text, sub_status_display, sub_evidence_para])
        else:
            # Regular item without sub-items
            status = item.get('status', 'Not Sure')
            if status == 'Yes':
                status_display = "✓ Yes"
            elif status == 'No':
                status_display = "✗ No"
            else:
                status_display = "Not Sure"
            
            item_text = Paragraph(item['item'], item_style)
            
            evidence = item.get('evidence', '')
            timestamp = item.get('timestamp')
            
            if evidence:
                if timestamp:
                    evidence_text = f"[{timestamp}] {evidence}"
                else:
                    evidence_text = evidence
                evidence_para = Paragraph(evidence_text, evidence_style)
            else:
                evidence_para = Paragraph("-", evidence_style)
            
            table_data.append([str(idx), item_text, status_display, evidence_para])
    
    table = Table(table_data, colWidths=[0.4*inch, 2.5*inch, 1*inch, 2.5*inch])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a56db')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
    ]))
    story.append(table)
    
    doc.build(story)
    return str(filename)
