provider "aws" {
  region = "eu-central-1" # Ensure this matches your .env file
}

# 1. Task Queue: Where API 1 sends "a" and "b"
resource "aws_sqs_queue" "task_queue" {
  name                      = "TaskQueue"
  delay_seconds             = 0
  max_message_size          = 262144 # 256 KB
  message_retention_seconds = 86400  # 1 day
  receive_wait_time_seconds = 20     # Enables Long Polling (saves money/CPU)
  
  # Ensure visibility timeout is longer than your processing time
  visibility_timeout_seconds = 30 
}

# 2. Result Queue: Where API 2 sends the computed result
resource "aws_sqs_queue" "result_queue" {
  name                      = "ResultQueue"
  delay_seconds             = 0
  max_message_size          = 262144
  message_retention_seconds = 86400
  receive_wait_time_seconds = 20
  
  visibility_timeout_seconds = 30
}

# --- Outputs ---
# Use these URLs in your Docker .env file
output "task_queue_url" {
  value = aws_sqs_queue.task_queue.id
}

output "result_queue_url" {
  value = aws_sqs_queue.result_queue.id
}


# 3. Security Group to allow access to our APIs
resource "aws_security_group" "api_sg" {
  name        = "api_security_group"
  description = "Allow web traffic to Producer and Worker"

  # Port 3000 for Producer API (API 1)
  ingress {
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Port 3001 for Worker API (API 2)
  ingress {
    from_port   = 3001
    to_port     = 3001
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # SSH Access (Optional - change to your IP for security)
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Outbound traffic (allow EC2 to talk to SQS)
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# 4. EC2 Instance for API 1 (Producer)
resource "aws_instance" "producer_api" {
  ami           = "ami-07df274a488ca9195" # Amazon Linux 2 in eu-central-1
  instance_type = "t2.micro"
  vpc_security_group_ids = [aws_security_group.api_sg.id]

  tags = {
    Name = "Producer-API"
  }
}

# 5. EC2 Instance for API 2 (Worker)
resource "aws_instance" "worker_api" {
  ami           = "ami-07df274a488ca9195" 
  instance_type = "t2.micro"
  vpc_security_group_ids = [aws_security_group.api_sg.id]

  tags = {
    Name = "Worker-API"
  }
}

# --- Additional Outputs ---
output "producer_public_ip" {
  value = aws_instance.producer_api.public_ip
}

output "worker_public_ip" {
  value = aws_instance.worker_api.public_ip
}