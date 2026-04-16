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
    
 
module.exports = {
  createGroqClient,
  getSimpleAIResponse,
  getContextualAIResponse,
  isEmergency,
  getEmergencyResponse
};