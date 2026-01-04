
# Scalable Capital Task — Running the Project

Short instructions to run the Producer (API) and Worker services locally or with Docker.

**Overview**
- This repository contains two services:
	- Producer API (`Producer_api`) — web UI and HTTP API that sends tasks to SQS and polls results.
	- Worker API (`worker_api`) — background processor that reads tasks from SQS and writes results back.

**Prerequisites**
- Node.js (v16+ recommended) and npm
- Docker & Docker Compose (only if you choose to run with Docker)
- AWS SQS queues (or a local SQS-compatible endpoint) and their URLs

**Environment**
Create a `.env` file at the project root (or set env vars in your environment) with at least:

```
TASK_QUEUE_URL=<your-task-queue-url>
RESULT_QUEUE_URL=<your-result-queue-url>
AWS_REGION=eu-central-1
```

The services use `dotenv` to load these values. `TASK_QUEUE_URL` and `RESULT_QUEUE_URL` are required.

**Run locally (recommended for development)**

- Producer API

```
cd Producer_api
npm install
npm run dev
```

Producer API listens on port `3000` by default. Open http://localhost:3000 to access the UI or use the `/add-task` endpoint.

- Worker API

```
cd worker_api
npm install
npm run dev
```

Worker API listens on port `3001` by default and continuously polls `TASK_QUEUE_URL`, sending results to `RESULT_QUEUE_URL`.

This will build the service images and start containers. The services will read environment variables from the `.env` file referenced by the compose file.

**Notes & troubleshooting**
- Ensure `TASK_QUEUE_URL` and `RESULT_QUEUE_URL` are valid and accessible from where the services run.
- If you prefer a local SQS-compatible service (for development), point the URLs to that endpoint and set `AWS_REGION` accordingly.
- If `docker-compose.yml` uses different folder names (for example `api-producer` or `api-worker`), either rename those folders or update the `build` paths to `./Producer_api` and `./worker_api`.

**Quick workflow**
- Start the Worker.
- Start the Producer.
- Use the Producer UI to add a task (convert_currency or calculate_interest).
- The Worker will process the task, send a result to the result queue, and the Producer polls the result queue and shows results on the UI.

If you want, I can also add a sample `.env.example` or update `docker-compose.yml` to match the folder names in this repo — tell me which you'd prefer.

**Run each Dockerfile manually (build & run images)**

If you prefer to build and run each service image directly from the service folders, use the following commands from the repository root.

- Build and run the Producer image (serves UI on port 3000):

```bash
docker build -t producer_api:local Producer_api/
docker run --rm -p 3000:3000 --env-file .env --name producer_api producer_api:local
```

- Build and run the Worker image (background processor on port 3001):

```bash
docker build -t worker_api:local worker_api/
docker run --rm -p 3001:3001 --env-file .env --name worker_api worker_api:local
```

Notes:
- The `--env-file .env` flag loads environment variables from the repository root `.env` file. Ensure that file contains `TASK_QUEUE_URL`, `RESULT_QUEUE_URL`, and `AWS_REGION`.
- Use `-d` instead of `--rm` if you want to run containers detached:

```bash
docker run -d -p 3000:3000 --env-file .env --name producer_api producer_api:local
docker run -d -p 3001:3001 --env-file .env --name worker_api worker_api:local
```

- To view logs:

```bash
docker logs -f producer_api
docker logs -f worker_api
```

- To stop and remove a running container:

```bash
docker stop producer_api worker_api
```

## 🚀 Architectural Decisions & Framework Strategy

### Centralization and Abstraction (The "Framework Team" Perspective)

* **Implementation Details**
Stack Justification
Node.js (Express): Chosen for its lightweight footprint and high proficiency. It allows for a modular approach, installing only necessary packages to keep the microservices performant.

TypeScript: Integrated to ensure a more resilient codebase through strict type-safety, which is critical for maintaining data integrity between the Producer and Worker.

Infrastructure (IaC)
The Terraform configuration defines the backbone of the system:

SQS Resources: Provisions two dedicated queues (Task and Result) to facilitate asynchronous communication.

Compute: Defines the EC2 infrastructure required to host and scale the APIs in a cloud environment.

* **Testing and Verification**
While the frontend dashboard provides a visual interface for testing, the APIs can be verified directly using the following cURL commands:

Create Interest Calculation Task


``` bash
curl -X POST http://localhost:3000/add-task \
     -H "Content-Type: application/json" \
     -d '{
           "type": "calculate_interest",
           "payload": {
             "principal": 1000.00,
             "annualRate": "0.015",
             "days": "90"
           }
         }'
```

Create Currency Conversion Task

``` bash
curl -X POST http://localhost:3000/add-task \
     -H "Content-Type: application/json" \
     -d '{
           "type": "convert_currency",
           "payload": {
             "amount": 100,
             "fromCurrency": "USD",
             "toCurrency": "EUR"
           }
         }'
```

If I were on the Application Framework team, my goal would be to provide an IDP that reduces cognitive load for product teams. I would achieve this by:

* **Custom SDK/Library Wrapper:** Instead of teams manually configuring AWS SDK clients, I would provide a standard npm package. This library would abstract SQS logic into simple methods: `TaskBroker.publish(task)` and `TaskBroker.subscribe(callback)`.
* **Standardized Messaging Schema:** I would enforce a shared schema (using TypeScript interfaces or Protobuf) to ensure the Producer and Worker always agree on the data contract, preventing runtime "type-mismatch" errors between services.
* **Infrastructure Abstraction:** I would centralize SQS and IAM configuration using Terraform Modules. App developers shouldn't need to know how to set Queue with terraform; they should juste run a commande whcih create the quue for them
* **Observability Middleware:** I would bake logging, distributed tracing (AWS X-Ray), and health checks into the framework so every new service has standard monitoring out of the box.

### Choice of Language and Framework

* **Node.js & TypeScript:** Enven through Python and Java and pretty solid language, I went fron Node.js because I am more proficient and for its non-blocking I/O, which is ideal for message-driven architectures. TypeScript provides the "type-safety" required for complex payloads shared between the Producer and Worker. 
* **Express.js:** Used for the Producer to provide a lightweight, high-performance REST interface.

## Scalability and Reliability

* **Decoupled Architecture:** By separating the Producer (User-facing) from the Worker (Compute-heavy), we ensure that a spike in compute tasks doesn't degrade the API's responsiveness.
* **Horizontal Scaling:** Using Docker we can deploy the apis on EC2/ECS/Kubernetes etc..., we can scale these services independently. If the queue grows, we can spin up more Worker containers without touching the Producer.
* **Resilience:** If the Worker fails, tasks are not lost; they remain safely persisted in SQS until the Worker recovers.
* **Concerns:** One concern is Race Conditions if multiple workers process the same result. I would mitigate this by ensuring tasks are idempotent (processing the same task twice doesn't change the outcome in our case not savin the result of a processed task multiple time). Or use Kafka which make use the queue item are not getting process my many consumer

## Security and Mitigation

* **Identity & Access Management (IAM):** I would use IAM Roles for EC2 Instances (Instance Profiles) rather than hardcoded `.env` credentials to follow the principle of least privilege.
* **Network Isolation:** The APIs should sit in a Private Subnet within a VPC. Only the Producer's Load Balancer should be public-facing.
* **Authentication:** For production, I would implement JWT (JSON Web Tokens) or integrate with AWS Cognito to ensure only authenticated users can trigger tasks.
* **Payload Validation:** Use libraries like `Joi` or `Zod` to sanitize inputs before they ever reach the SQS queue to prevent injection attacks.

## Future Improvements

1. **Event-Driven Evolution (SQS-SNS/EventBridge):** Move from polling to a push-model using SNS or SQS-to-Lambda triggers for near-zero latency.
2. **State Management:** Replace the in-memory `resultsArray` with a persistent store like Redis (for speed) or DynamoDB (for long-term durability).
3. **Advanced Lifecycle Management:** Implement ChangeMessageVisibility "heartbeats" for long-running tasks to prevent duplicate processing.
4. **Testing Suite:** Implement 100% test coverage with Jest for Unit tests and LocalStack for integration tests (simulating AWS SQS locally).
5. **Modern UI:** Transition the EJS views to a React for a better user experience with real-time state management (via React Query).
5. **Docker compose:** I could create a docker compose file which help start all of the apps with on command.


Note: I provided the the screenshot showing that the code works in the screenshot folder