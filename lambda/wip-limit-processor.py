import json
import boto3
import logging
from datetime import datetime, timezone
import os
import requests

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def handler(event, context):
    """
    Process WIP limit events and enforce constraints
    """
    try:
        dynamodb = boto3.resource('dynamodb')
        eventbridge = boto3.client('events')
        
        table_name = os.environ['DYNAMODB_TABLE']
        event_bus_name = os.environ['EVENT_BUS_NAME']
        slack_webhook = os.environ.get('SLACK_WEBHOOK', '')
        
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
                    
                    logger.info(f"Processing WIP limit event: {event_type}")
                    
                    if event_type == "WIP Limit Exceeded":
                        result = handle_wip_limit_exceeded(detail, wip_locks_table, slack_webhook)
                    elif event_type == "WIP Lock Acquired":
                        result = handle_wip_lock_acquired(detail, wip_locks_table)
                    elif event_type == "WIP Lock Released":
                        result = handle_wip_lock_released(detail, wip_locks_table)
                    else:
                        # Check for WIP limit violations on any project activity
                        result = check_wip_limits(detail, wip_locks_table)
                    
                    # Emit result event if needed
                    if result:
                        emit_wip_result(eventbridge, event_bus_name, result)
                    
            except Exception as e:
                logger.error(f"Error processing WIP record: {str(e)}")
                raise
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': f'Processed {len(event.get("Records", []))} WIP events'
            })
        }
        
    except Exception as e:
        logger.error(f"WIP limit processor failed: {str(e)}")
        raise

def handle_wip_limit_exceeded(detail, wip_locks_table, slack_webhook):
    """
    Handle WIP limit exceeded event
    """
    pod_id = detail.get('pod_id')
    item_type = detail.get('item_type')
    current_count = detail.get('current_count')
    limit = detail.get('limit')
    
    logger.warning(f"WIP limit exceeded for pod {pod_id}: {current_count}/{limit} {item_type}s")
    
    # Send Slack notification if webhook is configured
    if slack_webhook:
        send_slack_notification(slack_webhook, {
            'type': 'wip_limit_exceeded',
            'pod_id': pod_id,
            'item_type': item_type,
            'current_count': current_count,
            'limit': limit
        })
    
    # Block new work for this pod/item type
    block_result = block_new_work(wip_locks_table, pod_id, item_type)
    
    return {
        'event_type': 'wip_limit_enforced',
        'pod_id': pod_id,
        'item_type': item_type,
        'action': 'blocked',
        'blocked_at': datetime.now(timezone.utc).isoformat(),
        'reason': f'WIP limit exceeded: {current_count}/{limit}'
    }

def handle_wip_lock_acquired(detail, wip_locks_table):
    """
    Handle WIP lock acquisition
    """
    pod_id = detail.get('pod_id')
    item_id = detail.get('item_id')
    item_type = detail.get('item_type')
    user_id = detail.get('user_id')
    
    logger.info(f"WIP lock acquired: {pod_id}/{item_type}/{item_id} by {user_id}")
    
    # Record the lock in DynamoDB
    try:
        wip_locks_table.put_item(
            Item={
                'pod_id': pod_id,
                'item_id': item_id,
                'lock_type': item_type,
                'acquired_by': user_id,
                'acquired_at': datetime.now(timezone.utc).isoformat(),
                'expires_at': int((datetime.now(timezone.utc).timestamp() + 86400))  # 24 hours TTL
            }
        )
        
        # Check if this acquisition puts us over the limit
        current_count = count_active_wip_items(wip_locks_table, pod_id, item_type)
        pod_limits = get_pod_wip_limits(pod_id)  # You'd implement this
        
        if current_count > pod_limits.get(item_type, float('inf')):
            return {
                'event_type': 'wip_limit_exceeded',
                'pod_id': pod_id,
                'item_type': item_type,
                'current_count': current_count,
                'limit': pod_limits.get(item_type)
            }
        
    except Exception as e:
        logger.error(f"Failed to record WIP lock: {str(e)}")
        raise
    
    return None

def handle_wip_lock_released(detail, wip_locks_table):
    """
    Handle WIP lock release
    """
    pod_id = detail.get('pod_id')
    item_id = detail.get('item_id')
    item_type = detail.get('item_type')
    
    logger.info(f"WIP lock released: {pod_id}/{item_type}/{item_id}")
    
    try:
        # Update the lock record to mark as released
        wip_locks_table.update_item(
            Key={
                'pod_id': pod_id,
                'item_id': item_id
            },
            UpdateExpression='SET released_at = :released_at',
            ExpressionAttributeValues={
                ':released_at': datetime.now(timezone.utc).isoformat()
            }
        )
        
        # Check if we can unblock work for this pod/item type
        current_count = count_active_wip_items(wip_locks_table, pod_id, item_type)
        pod_limits = get_pod_wip_limits(pod_id)
        
        if current_count <= pod_limits.get(item_type, float('inf')):
            return {
                'event_type': 'wip_capacity_available',
                'pod_id': pod_id,
                'item_type': item_type,
                'current_count': current_count,
                'limit': pod_limits.get(item_type),
                'available_at': datetime.now(timezone.utc).isoformat()
            }
        
    except Exception as e:
        logger.error(f"Failed to release WIP lock: {str(e)}")
        raise
    
    return None

def check_wip_limits(detail, wip_locks_table):
    """
    Check WIP limits for any project activity
    """
    # This could be triggered by various events like PR creation, project start, etc.
    pod_id = detail.get('pod_id')
    project_id = detail.get('project_id')
    
    if not pod_id:
        return None
    
    # Check current WIP status for the pod
    wip_status = get_pod_wip_status(wip_locks_table, pod_id)
    pod_limits = get_pod_wip_limits(pod_id)
    
    violations = []
    for item_type, current_count in wip_status.items():
        limit = pod_limits.get(item_type, float('inf'))
        if current_count > limit:
            violations.append({
                'item_type': item_type,
                'current_count': current_count,
                'limit': limit
            })
    
    if violations:
        return {
            'event_type': 'wip_violations_detected',
            'pod_id': pod_id,
            'violations': violations,
            'detected_at': datetime.now(timezone.utc).isoformat()
        }
    
    return None

def count_active_wip_items(wip_locks_table, pod_id, item_type):
    """
    Count active WIP items for a pod and item type
    """
    try:
        response = wip_locks_table.query(
            IndexName='LockTypeIndex',  # Assuming this GSI exists
            KeyConditionExpression='lock_type = :item_type AND pod_id = :pod_id',
            FilterExpression='attribute_not_exists(released_at)',
            ExpressionAttributeValues={
                ':item_type': item_type,
                ':pod_id': pod_id
            }
        )
        return response['Count']
        
    except Exception as e:
        logger.error(f"Failed to count WIP items: {str(e)}")
        return 0

def get_pod_wip_limits(pod_id):
    """
    Get WIP limits for a pod (mock implementation)
    """
    # In a real implementation, this would query the database or configuration
    default_limits = {
        'Ratio': {'projects': 3, 'pull_requests': 5, 'deployments': 2},
        'Nanda': {'projects': 2, 'pull_requests': 4, 'deployments': 1},
        'Meta': {'projects': 2, 'pull_requests': 3, 'deployments': 1}
    }
    
    return default_limits.get(pod_id, {'projects': 2, 'pull_requests': 3, 'deployments': 1})

def get_pod_wip_status(wip_locks_table, pod_id):
    """
    Get current WIP status for a pod
    """
    try:
        response = wip_locks_table.query(
            KeyConditionExpression='pod_id = :pod_id',
            FilterExpression='attribute_not_exists(released_at)',
            ExpressionAttributeValues={
                ':pod_id': pod_id
            }
        )
        
        # Count by item type
        wip_counts = {}
        for item in response['Items']:
            item_type = item.get('lock_type', 'unknown')
            wip_counts[item_type] = wip_counts.get(item_type, 0) + 1
        
        return wip_counts
        
    except Exception as e:
        logger.error(f"Failed to get WIP status: {str(e)}")
        return {}

def block_new_work(wip_locks_table, pod_id, item_type):
    """
    Block new work for a pod/item type
    """
    try:
        # Create a special blocking lock
        wip_locks_table.put_item(
            Item={
                'pod_id': pod_id,
                'item_id': f'BLOCK_{item_type}_{int(datetime.now(timezone.utc).timestamp())}',
                'lock_type': f'{item_type}_block',
                'acquired_by': 'system',
                'acquired_at': datetime.now(timezone.utc).isoformat(),
                'expires_at': int((datetime.now(timezone.utc).timestamp() + 86400)),  # 24 hours
                'reason': 'WIP limit exceeded'
            }
        )
        return True
        
    except Exception as e:
        logger.error(f"Failed to block new work: {str(e)}")
        return False

def send_slack_notification(webhook_url, data):
    """
    Send Slack notification for WIP limit violations
    """
    try:
        if data['type'] == 'wip_limit_exceeded':
            message = {
                'text': f"🚨 WIP Limit Exceeded for Pod {data['pod_id']}",
                'attachments': [
                    {
                        'color': 'danger',
                        'fields': [
                            {
                                'title': 'Item Type',
                                'value': data['item_type'],
                                'short': True
                            },
                            {
                                'title': 'Current/Limit',
                                'value': f"{data['current_count']}/{data['limit']}",
                                'short': True
                            }
                        ],
                        'footer': 'CLOS v2.0 WIP Monitor',
                        'ts': int(datetime.now(timezone.utc).timestamp())
                    }
                ]
            }
        
        response = requests.post(webhook_url, json=message, timeout=10)
        if response.status_code == 200:
            logger.info("Slack notification sent successfully")
        else:
            logger.warning(f"Slack notification failed: {response.status_code}")
            
    except Exception as e:
        logger.error(f"Failed to send Slack notification: {str(e)}")

def emit_wip_result(eventbridge, event_bus_name, result):
    """
    Emit WIP processing result to EventBridge
    """
    try:
        response = eventbridge.put_events(
            Entries=[
                {
                    'Source': 'clos.wip-limits',
                    'DetailType': result['event_type'].replace('_', ' ').title(),
                    'Detail': json.dumps(result),
                    'EventBusName': event_bus_name
                }
            ]
        )
        logger.info(f"Emitted WIP result event: {result['event_type']}")
        
    except Exception as e:
        logger.error(f"Failed to emit WIP result: {str(e)}")
        raise