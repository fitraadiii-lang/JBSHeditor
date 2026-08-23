import fs from 'fs';

let content = fs.readFileSync('services/geminiService.ts', 'utf-8');

const targetLoop = `      const finishReason = response.candidates?.[0]?.finishReason;
      
      if (finishReason === 'MAX_TOKENS') {
        currentContents.push({
          role: "model",
          parts: [{ text: response.text }]
        });
        currentContents.push({
          role: "user",
          parts: [{ text: "Continue transcribing exactly from where you left off. Do not repeat the last sentence, just continue immediately. DO NOT STOP until you reach the end of the manuscript." }]
        });
        console.log("Max tokens reached. Continuing generation...");
      } else {
        isDone = true;
      }`;

const newLoop = `      const finishReason = response.candidates?.[0]?.finishReason;
      const hasEndMarker = fullText.includes('===END_OF_MANUSCRIPT===');
      
      if (finishReason === 'MAX_TOKENS' || (!hasEndMarker && finishReason === 'STOP')) {
        currentContents.push({
          role: "model",
          parts: [{ text: response.text }]
        });
        currentContents.push({
          role: "user",
          parts: [{ text: "You stopped prematurely without reaching ===END_OF_MANUSCRIPT===. Continue transcribing exactly from where you left off. Do not repeat the last sentence, just continue immediately. DO NOT STOP until you reach the end of the manuscript and output ===END_OF_MANUSCRIPT===." }]
        });
        console.log("Premature stop or max tokens. Continuing generation...");
        
        // Failsafe to prevent infinite loops if the model absolutely refuses to output the marker
        if (currentContents.length > 20) {
            console.warn("Failsafe triggered: Model stuck in continuation loop.");
            isDone = true;
        }
      } else {
        isDone = true;
      }`;

if (content.includes(targetLoop)) {
    content = content.replace(targetLoop, newLoop);
    fs.writeFileSync('services/geminiService.ts', content);
    console.log("Updated loop to check for END_OF_MANUSCRIPT marker");
} else {
    console.log("Target loop not found!");
}
