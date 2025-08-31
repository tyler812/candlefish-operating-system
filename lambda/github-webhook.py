import json
import boto3
import logging
import hmac
import hashlib
import os
from datetime import datetime, timezone

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def handler(event, context):
    """
    Handle GitHub webhook events and route them to EventBridge
    """
    try:
        eventbridge = boto3.client('events')
        sqs = boto3.client('sqs')
        
        event_bus_name = os.environ['EVENT_BUS_NAME']
        github_secret = os.environ.get('GITHUB_SECRET', '')
        queue_url = os.environ['QUEUE_URL']
        
        # Parse the incoming webhook request
        if 'body' in event:
            # API Gateway event
            body = event['body']
            headers = event.get('headers', {})
            
            # Verify GitHub signature if secret is configured
            if github_secret:
                signature = headers.get('X-Hub-Signature-256', '')
                if not verify_github_signature(body, signature, github_secret):
                    logger.warning("Invalid GitHub signature")
                    return {
                        'statusCode': 403,
                        'body': json.dumps({'error': 'Invalid signature'})
                    }
            
            # Parse webhook payload
            try:
                payload = json.loads(body)
            except json.JSONDecodeError:
                logger.error("Invalid JSON payload")
                return {
                    'statusCode': 400,
                    'body': json.dumps({'error': 'Invalid JSON'})
                }
            
        else:
            # Direct Lambda invocation (for testing)
            payload = event
            headers = {}
        
        # Extract event information
        event_type = headers.get('X-GitHub-Event', 'unknown')
        delivery_id = headers.get('X-GitHub-Delivery', 'unknown')
        
        logger.info(f"Processing GitHub webhook: {event_type} (delivery: {delivery_id})")
        
        # Process based on event type
        processed_events = []
        
        if event_type == 'pull_request':
            processed_events.append(process_pull_request_event(payload))
        elif event_type == 'push':
            processed_events.append(process_push_event(payload))
        elif event_type == 'deployment':
            processed_events.append(process_deployment_event(payload))
        elif event_type == 'deployment_status':
            processed_events.append(process_deployment_status_event(payload))
        elif event_type == 'issues':
            processed_events.append(process_issues_event(payload))
        elif event_type == 'workflow_run':
            processed_events.append(process_workflow_run_event(payload))
        else:
            logger.info(f"Unhandled GitHub event type: {event_type}")
            processed_events.append({
                'source': 'github.webhook',
                'detail_type': f'GitHub {event_type.title()}',
                'detail': {
                    'event_type': event_type,
                    'delivery_id': delivery_id,
                    'repository': payload.get('repository', {}),
                    'sender': payload.get('sender', {}),
                    'raw_payload': payload
                }
            })
        
        # Send events to EventBridge and SQS
        results = []
        for processed_event in processed_events:
            if processed_event:
                # Send to EventBridge
                eventbridge_result = send_to_eventbridge(eventbridge, event_bus_name, processed_event)
                
                # Send to SQS for processing
                sqs_result = send_to_sqs(sqs, queue_url, processed_event)
                
                results.append({
                    'event_type': processed_event['detail_type'],
                    'eventbridge': eventbridge_result,
                    'sqs': sqs_result
                })
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': f'Processed {len(results)} GitHub events',
                'results': results
            })
        }
        
    except Exception as e:
        logger.error(f"GitHub webhook processor failed: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }

def verify_github_signature(payload, signature, secret):
    """
    Verify GitHub webhook signature
    """
    try:
        expected_signature = 'sha256=' + hmac.new(
            secret.encode('utf-8'),
            payload.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
        
        return hmac.compare_digest(expected_signature, signature)
        
    except Exception as e:
        logger.error(f"Signature verification failed: {str(e)}")
        return False

def process_pull_request_event(payload):
    """
    Process GitHub pull request events
    """
    action = payload.get('action')
    pull_request = payload.get('pull_request', {})
    repository = payload.get('repository', {})
    sender = payload.get('sender', {})
    
    # Extract project information
    repo_name = repository.get('name')
    pr_number = pull_request.get('number')
    pr_title = pull_request.get('title')
    pr_state = pull_request.get('state')
    
    # Determine the pod from repository or labels
    pod_id = determine_pod_from_repository(repo_name, pull_request.get('labels', []))
    
    return {
        'source': 'github.webhook',
        'detail_type': 'Pull Request',
        'detail': {
            'action': action,
            'repository': repo_name,
            'pod_id': pod_id,
            'pull_request': {
                'number': pr_number,
                'title': pr_title,
                'state': pr_state,
                'url': pull_request.get('html_url'),
                'created_at': pull_request.get('created_at'),
                'updated_at': pull_request.get('updated_at'),
                'merged': pull_request.get('merged', False),
                'merged_at': pull_request.get('merged_at')
            },
            'author': {
                'login': sender.get('login'),
                'id': sender.get('id')
            },
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
    }

def process_push_event(payload):
    """
    Process GitHub push events
    """
    ref = payload.get('ref')
    repository = payload.get('repository', {})
    commits = payload.get('commits', [])
    pusher = payload.get('pusher', {})
    head_commit = payload.get('head_commit', {})
    
    repo_name = repository.get('name')
    pod_id = determine_pod_from_repository(repo_name)
    
    return {
        'source': 'github.webhook',
        'detail_type': 'Push',
        'detail': {
            'repository': repo_name,
            'pod_id': pod_id,
            'ref': ref,
            'commits': [{
                'id': commit.get('id'),
                'message': commit.get('message'),
                'author': commit.get('author', {}),
                'timestamp': commit.get('timestamp')
            } for commit in commits[-5:]],  # Last 5 commits
            'head_commit': {
                'id': head_commit.get('id'),
                'message': head_commit.get('message'),
                'author': head_commit.get('author', {}),
                'url': head_commit.get('url')
            },
            'pusher': pusher,
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
    }

def process_deployment_event(payload):
    """
    Process GitHub deployment events
    """
    deployment = payload.get('deployment', {})
    repository = payload.get('repository', {})
    
    repo_name = repository.get('name')
    pod_id = determine_pod_from_repository(repo_name)
    
    return {
        'source': 'github.webhook',
        'detail_type': 'Deployment',
        'detail': {
            'repository': repo_name,
            'pod_id': pod_id,
            'deployment': {
                'id': deployment.get('id'),
                'environment': deployment.get('environment'),
                'ref': deployment.get('ref'),
                'sha': deployment.get('sha'),
                'description': deployment.get('description'),
                'created_at': deployment.get('created_at')
            },
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
    }

def process_deployment_status_event(payload):
    """
    Process GitHub deployment status events
    """
    deployment = payload.get('deployment', {})
    deployment_status = payload.get('deployment_status', {})
    repository = payload.get('repository', {})
    
    repo_name = repository.get('name')
    pod_id = determine_pod_from_repository(repo_name)
    
    return {
        'source': 'github.webhook',
        'detail_type': 'Deployment Status',
        'detail': {
            'repository': repo_name,
            'pod_id': pod_id,
            'deployment': {
                'id': deployment.get('id'),
                'environment': deployment.get('environment')
            },
            'status': {
                'state': deployment_status.get('state'),
                'description': deployment_status.get('description'),
                'target_url': deployment_status.get('target_url'),
                'created_at': deployment_status.get('created_at')
            },
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
    }

def process_issues_event(payload):
    """
    Process GitHub issues events
    """
    action = payload.get('action')
    issue = payload.get('issue', {})
    repository = payload.get('repository', {})
    
    repo_name = repository.get('name')
    pod_id = determine_pod_from_repository(repo_name, issue.get('labels', []))
    
    return {
        'source': 'github.webhook',
        'detail_type': 'Issue',
        'detail': {
            'action': action,
            'repository': repo_name,
            'pod_id': pod_id,
            'issue': {
                'number': issue.get('number'),
                'title': issue.get('title'),
                'state': issue.get('state'),
                'labels': [label.get('name') for label in issue.get('labels', [])],
                'assignees': [assignee.get('login') for assignee in issue.get('assignees', [])],
                'created_at': issue.get('created_at'),
                'updated_at': issue.get('updated_at')
            },
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
    }

def process_workflow_run_event(payload):
    """
    Process GitHub workflow run events
    """
    action = payload.get('action')
    workflow_run = payload.get('workflow_run', {})
    repository = payload.get('repository', {})
    
    repo_name = repository.get('name')
    pod_id = determine_pod_from_repository(repo_name)
    
    return {
        'source': 'github.webhook',
        'detail_type': 'Workflow Run',
        'detail': {
            'action': action,
            'repository': repo_name,
            'pod_id': pod_id,
            'workflow': {
                'id': workflow_run.get('id'),
                'name': workflow_run.get('name'),
                'status': workflow_run.get('status'),
                'conclusion': workflow_run.get('conclusion'),
                'head_branch': workflow_run.get('head_branch'),
                'head_sha': workflow_run.get('head_sha'),
                'run_number': workflow_run.get('run_number'),
                'created_at': workflow_run.get('created_at'),
                'updated_at': workflow_run.get('updated_at')
            },
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
    }

def determine_pod_from_repository(repo_name, labels=None):
    """
    Determine which pod owns a repository based on naming or labels
    """
    # Repository naming patterns
    if any(keyword in repo_name.lower() for keyword in ['nanda', 'ai', 'automation']):
        return 'Nanda'
    elif any(keyword in repo_name.lower() for keyword in ['ratio', 'infrastructure', 'platform']):
        return 'Ratio'
    elif any(keyword in repo_name.lower() for keyword in ['meta', 'ops', 'process']):
        return 'Meta'
    
    # Check labels if provided
    if labels:
        label_names = [label.get('name', '').lower() for label in labels]
        if any('nanda' in label for label in label_names):
            return 'Nanda'
        elif any('ratio' in label for label in label_names):
            return 'Ratio'
        elif any('meta' in label for label in label_names):
            return 'Meta'
    
    # Default to Ratio for unknown repositories
    return 'Ratio'

def send_to_eventbridge(eventbridge, event_bus_name, processed_event):
    """
    Send processed event to EventBridge
    """
    try:
        response = eventbridge.put_events(
            Entries=[
                {
                    'Source': processed_event['source'],
                    'DetailType': processed_event['detail_type'],
                    'Detail': json.dumps(processed_event['detail']),
                    'EventBusName': event_bus_name
                }
            ]
        )
        
        if response['FailedEntryCount'] == 0:
            return {'status': 'success', 'event_id': response['Entries'][0]['EventId']}
        else:
            logger.error(f"EventBridge send failed: {response['Entries'][0]['ErrorMessage']}")
            return {'status': 'failed', 'error': response['Entries'][0]['ErrorMessage']}
            
    except Exception as e:
        logger.error(f"Failed to send to EventBridge: {str(e)}")
        return {'status': 'error', 'error': str(e)}

def send_to_sqs(sqs, queue_url, processed_event):
    """
    Send processed event to SQS for further processing
    """
    try:
        response = sqs.send_message(
            QueueUrl=queue_url,
            MessageBody=json.dumps(processed_event),
            MessageAttributes={
                'event_type': {
                    'StringValue': processed_event['detail_type'],
                    'DataType': 'String'
                },
                'repository': {
                    'StringValue': processed_event['detail'].get('repository', 'unknown'),
                    'DataType': 'String'
                },
                'pod_id': {
                    'StringValue': processed_event['detail'].get('pod_id', 'unknown'),
                    'DataType': 'String'
                }
            }
        )
        
        return {'status': 'success', 'message_id': response['MessageId']}
        
    except Exception as e:
        logger.error(f"Failed to send to SQS: {str(e)}")
        return {'status': 'error', 'error': str(e)}