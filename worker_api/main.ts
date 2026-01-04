import express from 'express';
import { 
  SQSClient, 
  ReceiveMessageCommand, 
  DeleteMessageCommand, 
  SendMessageCommand 
} from "@aws-sdk/client-sqs";
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// Configuration
const REGION = process.env.AWS_REGION || "eu-central-1";
const TASK_QUEUE_URL = process.env.TASK_QUEUE_URL!;
const RESULT_QUEUE_URL = process.env.RESULT_QUEUE_URL!;

const sqsClient = new SQSClient({ region: REGION });

interface CurrencyPayload {
    amount: number;
    fromCurrency: string;
    toCurrency: string;
}

interface InterestPayload {
    principal: number;
    annualRate: number;
    days: number;
}

interface TaskMessage {
    taskId: string;
    type: string;
    payload: any;
    timestamp: number;
}

// 2. Main Logic: Process Tasks
const processTasks = async (): Promise<void> => {
    const params = { 
        QueueUrl: TASK_QUEUE_URL, 
        MaxNumberOfMessages: 1, 
        WaitTimeSeconds: 20 
    };

    try {
        const data = await sqsClient.send(new ReceiveMessageCommand(params));
        
        if (data.Messages) {
            for (const message of data.Messages) {
                if (!message.Body) continue;

                const task: TaskMessage = JSON.parse(message.Body);
                const { type, payload, taskId } = task;
                let resultBody: any = null;

                // 3. Handle specific task types
                if (type.toLowerCase() === 'convert_currency') {
                    const { amount, fromCurrency, toCurrency } = payload as CurrencyPayload;
                    
                    const conversionRate = 1.1; // Hardcoded dummy rate
                    const convertedAmount = amount * conversionRate;
                    
                    resultBody = { 
                        type, 
                        taskId, 
                        result: { convertedAmount, processedAt: Date.now() } 
                    };
                } 

                else if (type.toLowerCase() === 'calculate_interest') {
                    const { principal, annualRate, days } = payload as InterestPayload;
                    const interest = principal * (annualRate / 100) * (days / 365);

                    console.log(`Calculated Interest: ${interest.toFixed(2)}`);

                    resultBody = { 
                        type, 
                        taskId, 
                        result: { interest, processedAt: Date.now() } 
                    };
                }

                // 4. Send Result back to ResultQueue
                if (resultBody) {
                    await sqsClient.send(new SendMessageCommand({
                        QueueUrl: RESULT_QUEUE_URL,
                        MessageBody: JSON.stringify(resultBody)
                    }));
                }

                // 5. Delete the original task from TaskQueue
                await sqsClient.send(new DeleteMessageCommand({
                    QueueUrl: TASK_QUEUE_URL,
                    ReceiptHandle: message.ReceiptHandle!
                }));
            }
        }
    } catch (err) {
        console.error("Worker error:", err);
    }

    setTimeout(processTasks, 1000);
};

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Worker API started on port ${PORT}`);
    console.log(`Listening to: ${TASK_QUEUE_URL}`);
    processTasks();
});