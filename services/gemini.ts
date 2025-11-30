
import { Task } from "../types";

// Safety check for environment variables to prevent crashes in browsers (Vite/Vercel)
// where 'process' might not be defined.
const getApiKey = () => {
    try {
        if (typeof process !== 'undefined' && process.env) {
            return process.env.API_KEY;
        }
    } catch (e) {
        // Ignore reference errors
    }
    return undefined;
};

interface AIResponse {
    tasks: Partial<Task>[];
}

export const parseNaturalLanguagePlan = async (input: string, baseTime: number): Promise<AIResponse> => {
    const apiKey = getApiKey();
    if (!apiKey) {
        console.warn("API_KEY not found. AI features will be disabled.");
        return { tasks: [] };
    }

    const nowStr = new Date(baseTime).toLocaleTimeString();

    const prompt = `
    I am a day planner. The current time is ${nowStr}.
    The user description is: "${input}".
    
    Return a JSON object with:
    1. "tasks": Array of tasks. Each has 'title' (string), 'duration' (number minutes), 'notes' (string).
    
    Estimate durations if not specified.
    `;

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: prompt }]
                    }],
                    generationConfig: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: "OBJECT",
                            properties: {
                                tasks: {
                                    type: "ARRAY",
                                    items: {
                                        type: "OBJECT",
                                        properties: {
                                            title: { type: "STRING" },
                                            duration: { type: "NUMBER" },
                                            notes: { type: "STRING" }
                                        },
                                        required: ["title", "duration"]
                                    }
                                }
                            }
                        }
                    }
                })
            }
        );

        if (!response.ok) {
            throw new Error(`Gemini API Error: ${response.statusText}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!text) return { tasks: [] };

        const result = JSON.parse(text);
        return {
            tasks: result.tasks || []
        };

    } catch (error) {
        console.error("Gemini API Error:", error);
        return { tasks: [] };
    }
};
