// groq-api.js - ENHANCED WITH MEMORY & CONTEXT
require('dotenv').config();
const OpenAI = require("openai");

function createGroqClient() {
  return new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
  });
}

/**
 * ENHANCED AI Response with User Context & Memory
 */
async function getContextualAIResponse(userMessage, userContext = {}, conversationHistory = []) {
  try {
    const client = createGroqClient();
    
    // Build personalized system prompt with user context
    const systemPrompt = buildSystemPrompt(userContext);
    
    // Build conversation messages with history
    const messages = buildMessages(systemPrompt, userMessage, conversationHistory);
    
    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: messages,
      temperature: 0.7,
      max_tokens: 400
    });

    const response = completion.choices[0].message.content;
    
    // Safety filter - remove booking-related phrases
    const filtered = response
      .replace(/I('ll| will) book/gi, 'You can book')
      .replace(/let me schedule/gi, 'You can schedule')
      .replace(/I('ll| will) arrange/gi, 'You can arrange');
    
    return filtered;

  } catch (error) {
    console.error("❌ AI Error:", error.message);
    
    // Personalized fallback with user name if available
    const userName = userContext.userName ? `, ${userContext.userName}` : '';
    return `Hello${userName}! I understand you're asking about: "${userMessage}"\n\n` +
           `For personalized medical advice, I recommend speaking with one of our doctors.\n\n` +
           `Type 'book' to schedule a consultation.`;
  }
}

/**
 * Build personalized system prompt based on user context
 */
function buildSystemPrompt(userContext) {
  const {
    userName,
    isReturningUser,
    hasAppointment,
    appointmentDetails,
    totalAppointments,
    lastAppointmentDate,
    pastAppointments
  } = userContext;
  
  let contextInfo = '';
  
  // Add user name if available
  if (userName) {
    contextInfo += `You are talking to ${userName}. `;
  }
  
  // Add returning user context
  if (isReturningUser) {
    contextInfo += `This is a returning patient. `;
    if (totalAppointments > 0) {
      contextInfo += `They have had ${totalAppointments} previous appointment(s). `;
    }
  } else {
    contextInfo += `This is a new patient. `;
  }
  
  // Add current appointment status
  if (hasAppointment && appointmentDetails) {
    contextInfo += `They currently have an appointment scheduled for ${appointmentDetails.date} at ${appointmentDetails.time} with ${appointmentDetails.doctorName}. `;
  }
  
  // Add past appointment context
  if (pastAppointments && pastAppointments.length > 0) {
    const lastAppt = pastAppointments[0];
    contextInfo += `Their last appointment was on ${lastAppt.appointment_date}. `;
  }
  
  return `You are QuickMed's friendly medical information assistant.

**USER CONTEXT:**
${contextInfo}

**YOUR ROLE:**
- Provide helpful, personalized health information
- Remember and reference the user's context naturally
- Be warm, empathetic, and professional
- Use the user's name when appropriate
- Reference their appointment history if relevant to the conversation

**CRITICAL RULES:**
1. NEVER book appointments - that's handled separately
2. NEVER say "I'll book an appointment for you"
3. NEVER mention specific dates, times, or scheduling
4. Provide general health information and advice only
5. Keep responses under 150 words
6. Be conversational and remember context from previous messages

**WHAT YOU DO:**
- Answer health questions with empathy
- Provide symptom information
- Give general health advice
- Explain medical terms
- Offer first-aid guidance
- Remember previous conversations
- Reference user's name and context naturally
- Build rapport with returning patients

**WHAT YOU DON'T DO:**
- Book appointments (users type 'book' for that)
- Schedule consultations
- Discuss specific availability
- Mention payment details

**TONE:**
- Friendly and warm (use their name!)
- Professional but conversational
- Empathetic to health concerns
- Encouraging about seeking professional care

**RESPONSE FORMAT:**
- Start with their name if you know it
- Brief and clear
- Use bullet points only when truly helpful
- End conversations naturally without always mentioning booking

Remember: You're a helpful health information assistant who knows the user. Be personal, remember context, and build trust.`;
}

/**
 * Build conversation messages with history
 */
function buildMessages(systemPrompt, userMessage, conversationHistory) {
  const messages = [
    {
      role: "system",
      content: systemPrompt
    }
  ];
  
  // Add recent conversation history (last 10 exchanges)
  if (conversationHistory && conversationHistory.length > 0) {
    // Reverse to get chronological order, then take last 10
    const recentHistory = conversationHistory
      .slice(0, 10)
      .reverse();
    
    recentHistory.forEach(msg => {
      if (msg.user_message) {
        messages.push({
          role: "user",
          content: msg.user_message
        });
      }
      if (msg.ai_message) {
        messages.push({
          role: "assistant",
          content: msg.ai_message
        });
      }
    });
  }
  
  // Add current user message
  messages.push({
    role: "user",
    content: userMessage
  });
  
  return messages;
}

/**
 * Simple AI Response (backward compatibility)
 */
async function getSimpleAIResponse(userMessage) {
  return getContextualAIResponse(userMessage, {}, []);
}

/**
 * Emergency detection
 */
function isEmergency(message) {
  const emergencyKeywords = [
    'chest pain', 'heart attack', 'stroke',
    'bleeding heavily', 'unconscious', 'overdose',
    'suicide', 'severe pain', 'can\'t breathe',
    'accident', 'injury', 'emergency'
  ];
  
  const lower = message.toLowerCase();
  return emergencyKeywords.some(keyword => lower.includes(keyword));
}

/**
 * Emergency response
 */
function getEmergencyResponse() {
  return `🚨 **THIS SOUNDS LIKE AN EMERGENCY**\n\n` +
         `⚠️ Please call emergency services immediately:\n` +
         `• Nigeria: 112 or 767\n` +
         `• Nearest hospital emergency room\n\n` +
         `This is a serious situation that requires immediate medical attention.\n\n` +
         `Our online service is for non-emergency consultations only.`;
}

module.exports = {
  createGroqClient,
  getSimpleAIResponse,
  getContextualAIResponse,
  isEmergency,
  getEmergencyResponse
};