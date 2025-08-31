import json
import boto3
import logging
from datetime import datetime, timezone
import os

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def handler(event, context):
    """
    Process stage gate transition requests
    """
    try:
        dynamodb = boto3.resource('dynamodb')
        eventbridge = boto3.client('events')
        
        table_name = os.environ['DYNAMODB_TABLE']
        event_bus_name = os.environ['EVENT_BUS_NAME']
        
        wip_locks_table = dynamodb.Table(table_name)
        
        # Process each SQS record
        for record in event.get('Records', []):
            try:
                # Parse the message body
                message_body = json.loads(record['body'])
                
                # Handle EventBridge events wrapped in SQS
                if 'detail' in message_body:
                    detail = message_body['detail']
                    event_type = message_body.get('detail-type', '')
                    
                    logger.info(f"Processing stage gate event: {event_type}")
                    
                    if event_type == "Stage Transition Request":
                        result = process_stage_transition_request(detail, wip_locks_table)
                    elif event_type == "Pull Request":
                        result = process_pull_request_event(detail, wip_locks_table)
                    elif event_type == "Push":
                        result = process_push_event(detail, wip_locks_table)
                    else:
                        logger.info(f"Unhandled event type: {event_type}")
                        continue
                    
                    # Emit result event
                    emit_stage_gate_result(eventbridge, event_bus_name, result)
                    
            except Exception as e:
                logger.error(f"Error processing record: {str(e)}")
                raise
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': f'Processed {len(event.get("Records", []))} stage gate events'
            })
        }
        
    except Exception as e:
        logger.error(f"Stage gate processor failed: {str(e)}")
        raise

def process_stage_transition_request(detail, wip_locks_table):
    """
    Process a stage transition request
    """
    project_id = detail.get('project_id')
    from_stage = detail.get('from_stage')
    to_stage = detail.get('to_stage')
    evidence = detail.get('evidence', {})
    
    logger.info(f"Processing stage transition: {project_id} from {from_stage} to {to_stage}")
    
    # Validate stage gate criteria
    validation_result = validate_stage_gate_criteria(to_stage, evidence)
    
    if validation_result['approved']:
        # Stage gate approved
        return {
            'event_type': 'stage_gate_approved',
            'project_id': project_id,
            'from_stage': from_stage,
            'to_stage': to_stage,
            'approved_at': datetime.now(timezone.utc).isoformat(),
            'criteria_met': validation_result['criteria_met']
        }
    else:
        # Stage gate rejected
        return {
            'event_type': 'stage_gate_rejected',
            'project_id': project_id,
            'from_stage': from_stage,
            'to_stage': to_stage,
            'rejected_at': datetime.now(timezone.utc).isoformat(),
            'reasons': validation_result['reasons']
        }

def process_pull_request_event(detail, wip_locks_table):
    """
    Process GitHub pull request events for stage gate automation
    """
    action = detail.get('action')
    pull_request = detail.get('pull_request', {})
    repository = detail.get('repository', {})
    
    repo_name = repository.get('name')
    pr_number = pull_request.get('number')
    
    logger.info(f"Processing PR event: {action} for {repo_name}#{pr_number}")
    
    if action == 'opened':
        # Check if this PR triggers a stage transition
        stage_info = extract_stage_from_pr(pull_request)
        if stage_info:
            return {
                'event_type': 'stage_transition_detected',
                'project_id': repo_name,
                'stage_info': stage_info,
                'pr_number': pr_number,
                'detected_at': datetime.now(timezone.utc).isoformat()
            }
    elif action == 'closed' and pull_request.get('merged'):
        # PR merged - potential stage completion
        return {
            'event_type': 'stage_completion_detected',
            'project_id': repo_name,
            'pr_number': pr_number,
            'merged_at': pull_request.get('merged_at')
        }
    
    return None

def process_push_event(detail, wip_locks_table):
    """
    Process GitHub push events for deployment detection
    """
    ref = detail.get('ref')
    repository = detail.get('repository', {})
    commits = detail.get('commits', [])
    
    repo_name = repository.get('name')
    
    # Check if push to main/production branch
    if ref in ['refs/heads/main', 'refs/heads/production']:
        logger.info(f"Deployment detected for {repo_name}")
        
        return {
            'event_type': 'deployment_detected',
            'project_id': repo_name,
            'ref': ref,
            'commit_count': len(commits),
            'head_commit': detail.get('head_commit', {}),
            'detected_at': datetime.now(timezone.utc).isoformat()
        }
    
    return None

def validate_stage_gate_criteria(stage, evidence):
    """
    Validate if criteria are met for stage gate transition
    """
    criteria_map = {
        'problem_definition': [
            'problem_statement',
            'user_research',
            'success_metrics'
        ],
        'solution_design': [
            'technical_design',
            'architecture_review',
            'capacity_planning'
        ],
        'development': [
            'code_complete',
            'unit_tests_passing',
            'code_review_approved'
        ],
        'testing': [
            'integration_tests_passing',
            'performance_tests_passing',
            'security_review_complete'
        ],
        'deployment': [
            'staging_deployment_successful',
            'load_testing_complete',
            'rollback_plan_approved'
        ],
        'monitoring': [
            'production_deployment_successful',
            'monitoring_alerts_configured',
            'post_deployment_verification'
        ]
    }
    
    required_criteria = criteria_map.get(stage, [])
    criteria_met = []
    missing_criteria = []
    
    for criterion in required_criteria:
        if evidence.get(criterion):
            criteria_met.append(criterion)
        else:
            missing_criteria.append(criterion)
    
    approved = len(missing_criteria) == 0
    
    return {
        'approved': approved,
        'criteria_met': criteria_met,
        'reasons': missing_criteria if not approved else []
    }

def extract_stage_from_pr(pull_request):
    """
    Extract stage information from pull request title/labels
    """
    title = pull_request.get('title', '').lower()
    labels = [label.get('name', '').lower() for label in pull_request.get('labels', [])]
    
    stage_keywords = {
        'inception': ['inception', 'idea', 'proposal'],
        'problem_definition': ['problem', 'research', 'requirements'],
        'solution_design': ['design', 'architecture', 'spec'],
        'development': ['development', 'implementation', 'code'],
        'testing': ['testing', 'qa', 'validation'],
        'deployment': ['deployment', 'release', 'prod'],
        'monitoring': ['monitoring', 'observability', 'metrics']
    }
    
    for stage, keywords in stage_keywords.items():
        if any(keyword in title or keyword in ' '.join(labels) for keyword in keywords):
            return {
                'target_stage': stage,
                'confidence': 0.8  # Simple confidence score
            }
    
    return None

def emit_stage_gate_result(eventbridge, event_bus_name, result):
    """
    Emit stage gate processing result to EventBridge
    """
    if not result:
        return
    
    try:
        response = eventbridge.put_events(
            Entries=[
                {
                    'Source': 'clos.stage-gates',
                    'DetailType': result['event_type'].replace('_', ' ').title(),
                    'Detail': json.dumps(result),
                    'EventBusName': event_bus_name
                }
            ]
        )
        logger.info(f"Emitted stage gate result event: {result['event_type']}")
        
    except Exception as e:
        logger.error(f"Failed to emit stage gate result: {str(e)}")
        raise