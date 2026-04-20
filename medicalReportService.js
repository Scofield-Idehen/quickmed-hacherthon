// medicalReportService.js - AI-Powered Medical Report Generation
const { getContextualAIResponse } = require('./groq-api');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');

/**
 * Extract medical information from consultation transcript
 */
async function analyzeMedicalConsultation(transcription, patientInfo, doctorInfo) {


Please analyze this consultation and provide a structured medical report with:

1. CHIEF COMPLAINT: What brought the patient to the doctor?
2. SYMPTOMS: List all symptoms mentioned
3. MEDICAL HISTORY: Any relevant medical history discussed
4. DIAGNOSIS: Doctor's diagnosis or assessment
5. TREATMENT PLAN: Prescribed medications, treatments, or recommendations
6. FOLLOW-UP: Any follow-up instructions or next appointments mentioned
7. LIFESTYLE RECOMMENDATIONS: Diet, exercise, or lifestyle changes suggested
8. RED FLAGS: Any warning signs or symptoms to watch for

Format the response as a clear, professional medical report.`;

    const analysis = await getContextualAIResponse(
      analysisPrompt,
      { userName: patientInfo.name },
      []
    );

    console.log('✅ Consultation analyzed');

    return {
      summary: analysis,
      chiefComplaint: extractSection(analysis, 'CHIEF COMPLAINT'),
      symptoms: extractSection(analysis, 'SYMPTOMS'),
      diagnosis: extractSection(analysis, 'DIAGNOSIS'),
      treatmentPlan: extractSection(analysis, 'TREATMENT PLAN'),
      followUp: extractSection(analysis, 'FOLLOW-UP'),
      lifestyle: extractSection(analysis, 'LIFESTYLE RECOMMENDATIONS'),
      redFlags: extractSection(analysis, 'RED FLAGS')
    };

  } catch (error) {
    console.error('❌ Error analyzing consultation:', error.message);
    throw error;
  }
}

/**
 * Extract a specific section from the AI analysis
 */
function extractSection(text, sectionName) {
  const regex = new RegExp(`${sectionName}:?\\s*([\\s\\S]*?)(?=\\n\\n[A-Z]+:|$)`, 'i');
  const match = text.match(regex);
  return match ? match[1].trim() : '';
}

/**
 * Generate PDF medical report
 */
async function generatePDFReport(reportData) {
  try {
    console.log('📄 Generating PDF report...');

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4 size
    const { width, height } = page.getSize();

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let yPosition = height - 50;
    const leftMargin = 50;
    const lineHeight = 15;

    // Header
    page.drawText('QUICKMED CONSULTATION REPORT', {
      x: leftMargin,
      y: yPosition,
      size: 18,
      font: boldFont,
      color: rgb(0, 0.4, 0.6)
    });

    yPosition -= 30;

    // Report details
    const details = [
      `Report Date: ${reportData.reportDate}`,

      `Duration: ${reportData.duration}`
    ];

    page.drawText(details.join('\n'), {
      x: leftMargin,
      y: yPosition,
      size: 10,
      font: font,
\
    page.drawLine({
      start: { x: leftMargin, y: yPosition },
      end: { x: width - leftMargin, y: yPosition },
      thickness: 1,
      color: rgb(0.7, 0.7, 0.7)
    });

    yPosition -= 20;

    // Medical sections
    const sections = [
      { title: 'CHIEF COMPLAINT', content: reportData.chiefComplaint },
      { title: 'SYMPTOMS', content: reportData.symptoms },
      { title: 'DIAGNOSIS', content: reportData.diagnosis },
      { title: 'TREATMENT PLAN', content: reportData.treatmentPlan },
      { title: 'FOLLOW-UP INSTRUCTIONS', content: reportData.followUp },
      { title: 'LIFESTYLE RECOMMENDATIONS', content: reportData.lifestyle },
      { title: 'WARNING SIGNS', content: reportData.redFlags }
    ];

    for (const section of sections) {
      if (section.content && section.content.trim()) {
        // Section title
        page.drawText(section.title, {
          x: leftMargin,
          y: yPosition,
          size: 12,
          font: boldFont,
          color: rgb(0.2, 0.2, 0.2)
        });

        yPosition -= 18;

        // Section content (wrap text)
        const wrappedText = wrapText(section.content, 75); // ~75 chars per line
        const lines = wrappedText.split('\n');

        for (const line of lines) {
          if (yPosition < 80) {
            // Add new page if running out of space
            const newPage = pdfDoc.addPage([595, 842]);
            yPosition = height - 50;
          }

          page.drawText(line, {
            x: leftMargin,
            y: yPosition,
            size: 10,
            font: font,
            color: rgb(0.3, 0.3, 0.3)
          });

          yPosition -= lineHeight;
        }

        yPosition -= 10; // Extra space between sections
      }
    }

    // Footer
    yPosition = 50;
    page.drawText('This report is confidential and for medical purposes onl
      y: yPosition,
      size: 8,
      font: font,
      color: rgb(0.5, 0.5, 0.5)
    });

    page.drawText('QuickMed - Digital Healthcare Platform', {
      x: leftMargin,
      y: yPosition - 12,
      size: 8,
      font: font,
      color: rgb(0.5, 0.5, 0.5)
    });

    const pdfBytes = await pdfDoc.save();
    
    console.log('✅ PDF report generated');

    return pdfBytes;

  } catch (error) {
    console.error('❌ Error generating PDF:', error.message);
    throw error;
  }
}

/**

/**
 * Save report to file system
 */
async function saveReport(pdfBytes, appointmentId) {
  try {
    const reportsDir = path.join(__dirname, 'reports');
    
    // Create reports directory if it doesn't exist
    try {
      await fs.access(reportsDir);
    } catch {
      await fs.mkdir(reportsDir, { recursive: true });
    }

    const filename = `report_${appointmentId}_${Date.now()}.pdf`;
    const filepath = path.join(reportsDir, filename);

    await fs.writeFile(filepath, pdfBytes);

    console.log('✅ Report saved to:', filepath);

    return {
      filename,
      filepath,
      size: pdfBytes.length
    };

  } catch (error) {
    console.error('❌ Error saving report:', error.message);
    throw error;
  }
}

/**
 * Generate complete medical report from consultation
 */
async function generateConsultationReport(appointmentData, transcription) {
  try {
    console.log('📋 Generating consultation report...');

    // Analyze the consultation
    const analysis = await analyzeMedicalConsultation(
      transcription,
      {
        name: appointmentData.patientName,
        phone: appointmentData.patientPhone
      },
      {
        full_name: appointmentData.doctorName,
        specialty: appointmentData.specialty
      }
    );

    // Prepare report data
    const reportData = {
      reportDate: new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }),
      patientName: appointmentData.patientName,
      doctorName: appointmentData.doctorName,
      specialty: appointmentData.specialty,
      consultationDate: appointmentData.date,
      duration: formatDuration(transcription.duration),
      chiefComplaint: analysis.chiefComplaint,
      symptoms: analysis.symptoms,
      diagnosis: analysis.diagnosis,
      treatmentPlan: analysis.treatmentPlan,
      followUp: analysis.followUp,
      lifestyle: analysis.lifestyle,
      redFlags: analysis.redFlags
    };

    // Generate PDF
    const pdfBytes = await generatePDFReport(reportData);

    // Save to file
    const savedFile = await saveReport(pdfBytes, appointmentData.appointmentId);

    console.log('✅ Consultation report generated successfully');

    return {
      success: true,
      reportPath: savedFile.filepath,
      reportFilename: savedFile.filename,
      analysis: analysis.summary,
      fileSize: savedFile.size
    };

  return `${mins} minute${mins !== 1 ? 's' : ''} ${secs} second${secs !== 1 ? 's' : ''}`;
}

module.exports = {
  analyzeMedicalConsultation,
  generatePDFReport,
  generateConsultationReport,
  saveReport
};