import express, { Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import path from 'path';
import { 
  SQSClient, 
  SendMessageCommand, 
  ReceiveMessageCommand, 
  DeleteMessageCommand
} from "@aws-sdk/client-sqs";
import * as dotenv from 'dotenv';

dotenv.config();

interface TaskPayload {
  amount: number;
  fromCurrency: string;
  toCurrency: string;
}

interface Task {
  taskId: string;
  type: string;
  payload: TaskPayload;
  timestamp: number;
  result?: number; 
}

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const REGION = process.env.AWS_REGION || "eu-central-1";
const TASK_QUEUE_URL = process.env.TASK_QUEUE_URL!;
const RESULT_QUEUE_URL = process.env.RESULT_QUEUE_URL!;

const sqsClient = new SQSClient({ region: REGION });

// In-memory storage
let resultsArray: Task[] = [];
let taskArray: Task[] = [];

app.get('/', (req: Request, res: Response) => {
    res.render('index', { results: resultsArray });
});

// Add Task Route
app.post('/add-task', async (req: Request, res: Response) => {
    const { type, ...payload } = req.body;

    console.log("Received new task:", type, payload);

    // Create the task object with our interface
    const task: Task = { 
        taskId: uuid(), 
        type, 
        payload: payload, 
        timestamp: Date.now() 
    };
    
    const params = {
        QueueUrl: TASK_QUEUE_URL,
        MessageBody: JSON.stringify(task),
    };

    try {
        await sqsClient.send(new SendMessageCommand(params));
        taskArray.push(task); 
        res.status(200).send({ message: "Task sent to queue!", taskId: task.taskId });
    } catch (err: any) {
        res.status(500).send(err.message);
    }
});

app.get('/results', (req: Request, res: Response) => {
  res.render('results', { resultsArray: resultsArray });
});

// 3. Background Poller
const pollResults = async (): Promise<void> => {
    const params = { 
        QueueUrl: RESULT_QUEUE_URL, 
        MaxNumberOfMessages: 1, 
        WaitTimeSeconds: 20 
    };
    
    try {
        const data = await sqsClient.send(new ReceiveMessageCommand(params));
        
        if (data.Messages) {
            for (const message of data.Messages) {
                if (message.Body) {
                    const body: Task = JSON.parse(message.Body);
                    resultsArray.push(body); 
                    
                    await sqsClient.send(new DeleteMessageCommand({
                        QueueUrl: RESULT_QUEUE_URL,
                        ReceiptHandle: message.ReceiptHandle!
                    }));
                }
            }
        }
        console.log("Polling complete. Current results:", resultsArray);
    } catch (err) {
        console.error("Polling error:", err);
    }
    
    // Using setTimeout to prevent stack overflow while maintaining constant polling
    setTimeout(pollResults, 1000);
};

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`API 1 (Producer) running on port ${PORT}`);
    pollResults();
});