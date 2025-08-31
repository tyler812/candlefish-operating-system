import json
import boto3
import logging
import psycopg2
from datetime import datetime, timezone, timedelta
import os
import requests

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def handler(event, context):
    """
    Handle daily unblock and weekly demo preparation
    """
    try:
        # Determine event type
        event_type = event.get('event_type', 'daily_unblock')
        
        logger.info(f"Processing {event_type} event")
        
        if event_type == 'weekly_demo':
            return handle_weekly_demo_preparation(event, context)
        else:
            return handle_daily_unblock(event, context)
            
    except Exception as e:
        logger.error(f"Daily unblock processor failed: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }

def handle_daily_unblock(event, context):
    """
    Handle the daily unblock process
    """
    try:
        # Get database connection
        conn = get_database_connection()
        cur = conn.cursor()
        
        # Get blocked items and impediments
        blocked_items = get_blocked_items(cur)
        impediments = get_active_impediments(cur)
        wip_violations = get_wip_violations()
        
        # Generate unblock report
        report = generate_unblock_report(blocked_items, impediments, wip_violations)
        
        # Send to Slack
        slack_result = send_daily_unblock_to_slack(report)
        
        # Emit event
        eventbridge_result = emit_daily_unblock_event(report)
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Daily unblock processed successfully',
                'blocked_items': len(blocked_items),
                'impediments': len(impediments),
                'wip_violations': len(wip_violations),
                'slack_sent': slack_result['status'] == 'success',
                'event_emitted': eventbridge_result['status'] == 'success'
            })
        }
        
    except Exception as e:
        logger.error(f"Daily unblock failed: {str(e)}")
        raise
    
    finally:
        if 'cur' in locals():
            cur.close()
        if 'conn' in locals():
            conn.close()

def handle_weekly_demo_preparation(event, context):
    """
    Handle weekly demo preparation
    """
    try:
        # Get database connection
        conn = get_database_connection()
        cur = conn.cursor()
        
        # Get completed work for the week
        completed_work = get_weekly_completed_work(cur)
        demo_candidates = get_demo_candidates(cur)
        pod_summaries = get_pod_weekly_summaries(cur)
        
        # Generate demo preparation report
        demo_report = generate_demo_report(completed_work, demo_candidates, pod_summaries)
        
        # Send to Slack
        slack_result = send_weekly_demo_to_slack(demo_report)
        
        # Emit event
        eventbridge_result = emit_weekly_demo_event(demo_report)
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Weekly demo preparation processed successfully',
                'completed_work': len(completed_work),
                'demo_candidates': len(demo_candidates),
                'slack_sent': slack_result['status'] == 'success',
                'event_emitted': eventbridge_result['status'] == 'success'
            })
        }
        
    except Exception as e:
        logger.error(f"Weekly demo preparation failed: {str(e)}")
        raise
    
    finally:
        if 'cur' in locals():
            cur.close()
        if 'conn' in locals():
            conn.close()

def get_database_connection():
    """
    Get database connection using secrets manager
    """
    try:
        secret_arn = os.environ['SECRET_ARN']
        secrets_client = boto3.client('secretsmanager')
        
        secret_response = secrets_client.get_secret_value(SecretId=secret_arn)
        secret = json.loads(secret_response['SecretString'])
        
        return psycopg2.connect(
            host=os.environ['RDS_ENDPOINT'],
            database='clos',
            user=secret['username'],
            password=secret['password'],
            port=5432
        )
        
    except Exception as e:
        logger.error(f"Database connection failed: {str(e)}")
        raise

def get_blocked_items(cursor):
    """
    Get items that are blocked or stuck
    """
    try:
        # Look for projects that haven't had activity in 3+ days
        cursor.execute("""
        SELECT 
            p.id,
            p.name,
            p.current_stage,
            p.updated_at,
            pod.name as pod_name,
            u.name as lead_name
        FROM projects p
        JOIN pods pod ON p.pod_id = pod.id
        LEFT JOIN users u ON pod.lead_id = u.id
        WHERE p.updated_at < NOW() - INTERVAL '3 days'
            AND p.current_stage != 'monitoring'
        ORDER BY p.updated_at ASC
        """)
        
        blocked_items = []
        for row in cursor.fetchall():
            blocked_items.append({
                'id': str(row[0]),
                'name': row[1],
                'current_stage': row[2],
                'last_updated': row[3].isoformat() if row[3] else None,
                'pod_name': row[4],
                'lead_name': row[5],
                'days_blocked': (datetime.now() - row[3]).days if row[3] else None
            })
        
        return blocked_items
        
    except Exception as e:
        logger.error(f"Failed to get blocked items: {str(e)}")
        return []

def get_active_impediments(cursor):
    """
    Get active impediments from activities table
    """
    try:
        # Look for impediment-related activities
        cursor.execute("""
        SELECT 
            a.id,
            a.action,
            a.details,
            a.created_at,
            u.name as user_name,
            p.name as project_name
        FROM activities a
        JOIN users u ON a.user_id = u.id
        LEFT JOIN projects p ON a.resource_id = p.id AND a.resource_type = 'project'
        WHERE a.action LIKE '%impediment%' OR a.action LIKE '%blocked%'
            AND a.created_at > NOW() - INTERVAL '7 days'
        ORDER BY a.created_at DESC
        LIMIT 50
        """)
        
        impediments = []
        for row in cursor.fetchall():
            impediments.append({
                'id': str(row[0]),
                'action': row[1],
                'details': row[2],
                'created_at': row[3].isoformat() if row[3] else None,
                'user_name': row[4],
                'project_name': row[5] or 'Unknown'
            })
        
        return impediments
        
    except Exception as e:
        logger.error(f"Failed to get impediments: {str(e)}")
        return []

def get_wip_violations():
    """
    Get current WIP limit violations from DynamoDB
    """
    try:
        dynamodb = boto3.resource('dynamodb')
        table_name = os.environ.get('DYNAMODB_TABLE', 'clos-v2-wip-locks')
        wip_locks_table = dynamodb.Table(table_name)
        
        # This is a simplified check - in reality you'd aggregate by pod and type
        response = wip_locks_table.scan(
            FilterExpression='attribute_not_exists(released_at)'
        )
        
        # Group by pod and count violations
        pod_counts = {}
        for item in response['Items']:
            pod_id = item.get('pod_id')
            lock_type = item.get('lock_type', 'unknown')
            
            if pod_id not in pod_counts:
                pod_counts[pod_id] = {}
            if lock_type not in pod_counts[pod_id]:
                pod_counts[pod_id][lock_type] = 0
            
            pod_counts[pod_id][lock_type] += 1
        
        # Check against limits (simplified)
        violations = []
        limits = {
            'Ratio': {'projects': 3, 'pull_requests': 5},
            'Nanda': {'projects': 2, 'pull_requests': 4},
            'Meta': {'projects': 2, 'pull_requests': 3}
        }
        
        for pod_id, counts in pod_counts.items():
            pod_limits = limits.get(pod_id, {})
            for item_type, count in counts.items():
                limit = pod_limits.get(item_type, float('inf'))
                if count > limit:
                    violations.append({
                        'pod_id': pod_id,
                        'item_type': item_type,
                        'current_count': count,
                        'limit': limit
                    })
        
        return violations
        
    except Exception as e:
        logger.error(f"Failed to get WIP violations: {str(e)}")
        return []

def get_weekly_completed_work(cursor):
    """
    Get completed work for the past week
    """
    try:
        cursor.execute("""
        SELECT 
            st.project_id,
            p.name,
            st.from_stage,
            st.to_stage,
            st.approved_at,
            pod.name as pod_name,
            u.name as approved_by_name
        FROM stage_transitions st
        JOIN projects p ON st.project_id = p.id
        JOIN pods pod ON p.pod_id = pod.id
        LEFT JOIN users u ON st.approved_by = u.id
        WHERE st.approved_at > NOW() - INTERVAL '7 days'
        ORDER BY st.approved_at DESC
        """)
        
        completed_work = []
        for row in cursor.fetchall():
            completed_work.append({
                'project_id': str(row[0]),
                'project_name': row[1],
                'from_stage': row[2],
                'to_stage': row[3],
                'completed_at': row[4].isoformat() if row[4] else None,
                'pod_name': row[5],
                'approved_by': row[6] or 'System'
            })
        
        return completed_work
        
    except Exception as e:
        logger.error(f"Failed to get completed work: {str(e)}")
        return []

def get_demo_candidates(cursor):
    """
    Get projects that are good candidates for demo
    """
    try:
        cursor.execute("""
        SELECT 
            p.id,
            p.name,
            p.current_stage,
            p.deployed_url,
            pod.name as pod_name,
            p.updated_at
        FROM projects p
        JOIN pods pod ON p.pod_id = pod.id
        WHERE p.current_stage IN ('deployment', 'monitoring')
            AND p.updated_at > NOW() - INTERVAL '14 days'
        ORDER BY p.updated_at DESC
        """)
        
        candidates = []
        for row in cursor.fetchall():
            candidates.append({
                'id': str(row[0]),
                'name': row[1],
                'current_stage': row[2],
                'deployed_url': row[3],
                'pod_name': row[4],
                'updated_at': row[5].isoformat() if row[5] else None
            })
        
        return candidates
        
    except Exception as e:
        logger.error(f"Failed to get demo candidates: {str(e)}")
        return []

def get_pod_weekly_summaries(cursor):
    """
    Get weekly summaries for each pod
    """
    try:
        cursor.execute("""
        SELECT 
            pod.name,
            COUNT(CASE WHEN st.approved_at > NOW() - INTERVAL '7 days' THEN 1 END) as transitions_this_week,
            COUNT(CASE WHEN p.current_stage = 'monitoring' THEN 1 END) as completed_projects,
            COUNT(p.id) as total_active_projects,
            pod.health_score
        FROM pods pod
        LEFT JOIN projects p ON pod.id = p.pod_id
        LEFT JOIN stage_transitions st ON p.id = st.project_id
        WHERE pod.status = 'active'
        GROUP BY pod.id, pod.name, pod.health_score
        """)
        
        summaries = []
        for row in cursor.fetchall():
            summaries.append({
                'pod_name': row[0],
                'transitions_this_week': row[1] or 0,
                'completed_projects': row[2] or 0,
                'total_active_projects': row[3] or 0,
                'health_score': float(row[4]) if row[4] else 100.0
            })
        
        return summaries
        
    except Exception as e:
        logger.error(f"Failed to get pod summaries: {str(e)}")
        return []

def generate_unblock_report(blocked_items, impediments, wip_violations):
    """
    Generate daily unblock report
    """
    return {
        'date': datetime.now(timezone.utc).isoformat(),
        'type': 'daily_unblock',
        'summary': {
            'blocked_items_count': len(blocked_items),
            'impediments_count': len(impediments),
            'wip_violations_count': len(wip_violations)
        },
        'blocked_items': blocked_items,
        'impediments': impediments,
        'wip_violations': wip_violations,
        'action_required': len(blocked_items) > 0 or len(wip_violations) > 0
    }

def generate_demo_report(completed_work, demo_candidates, pod_summaries):
    """
    Generate weekly demo report
    """
    return {
        'date': datetime.now(timezone.utc).isoformat(),
        'type': 'weekly_demo',
        'week_ending': (datetime.now() + timedelta(days=(4 - datetime.now().weekday()))).date().isoformat(),
        'summary': {
            'completed_work_count': len(completed_work),
            'demo_candidates_count': len(demo_candidates),
            'active_pods': len(pod_summaries)
        },
        'completed_work': completed_work,
        'demo_candidates': demo_candidates,
        'pod_summaries': pod_summaries
    }

def send_daily_unblock_to_slack(report):
    """
    Send daily unblock report to Slack
    """
    try:
        slack_token = os.environ.get('SLACK_TOKEN', '')
        if not slack_token:
            return {'status': 'skipped', 'reason': 'No Slack token configured'}
        
        # Format Slack message
        blocks = format_unblock_slack_message(report)
        
        # Send to appropriate channels (this would be configured)
        slack_client = boto3.client('ssm')  # Using SSM for channel configuration
        
        # For demo purposes, we'll log the message
        logger.info(f"Would send to Slack: {json.dumps(blocks, indent=2)}")
        
        return {'status': 'success', 'message': 'Slack message prepared'}
        
    except Exception as e:
        logger.error(f"Failed to send to Slack: {str(e)}")
        return {'status': 'error', 'error': str(e)}

def send_weekly_demo_to_slack(demo_report):
    """
    Send weekly demo report to Slack
    """
    try:
        slack_token = os.environ.get('SLACK_TOKEN', '')
        if not slack_token:
            return {'status': 'skipped', 'reason': 'No Slack token configured'}
        
        # Format Slack message
        blocks = format_demo_slack_message(demo_report)
        
        # For demo purposes, we'll log the message
        logger.info(f"Would send demo report to Slack: {json.dumps(blocks, indent=2)}")
        
        return {'status': 'success', 'message': 'Demo report prepared'}
        
    except Exception as e:
        logger.error(f"Failed to send demo report to Slack: {str(e)}")
        return {'status': 'error', 'error': str(e)}

def format_unblock_slack_message(report):
    """
    Format unblock report for Slack
    """
    blocks = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": "🚨 Daily Unblock Report"
            }
        }
    ]
    
    if report['blocked_items']:
        blocks.append({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*Blocked Items ({len(report['blocked_items'])}):*"
            }
        })
        
        for item in report['blocked_items'][:5]:  # Show top 5
            blocks.append({
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"• *{item['name']}* ({item['pod_name']}) - {item['days_blocked']} days in {item['current_stage']}"
                }
            })
    
    if report['wip_violations']:
        blocks.append({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*WIP Violations ({len(report['wip_violations'])}):*"
            }
        })
        
        for violation in report['wip_violations']:
            blocks.append({
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"• *{violation['pod_id']}*: {violation['current_count']}/{violation['limit']} {violation['item_type']}"
                }
            })
    
    return blocks

def format_demo_slack_message(demo_report):
    """
    Format demo report for Slack
    """
    blocks = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": "🎯 Weekly Demo Preparation"
            }
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"Week ending: {demo_report['week_ending']}"
            }
        }
    ]
    
    if demo_report['demo_candidates']:
        blocks.append({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*Demo Candidates ({len(demo_report['demo_candidates'])}):*"
            }
        })
        
        for candidate in demo_report['demo_candidates'][:5]:
            url_text = f" - <{candidate['deployed_url']}|View>" if candidate['deployed_url'] else ""
            blocks.append({
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"• *{candidate['name']}* ({candidate['pod_name']}){url_text}"
                }
            })
    
    return blocks

def emit_daily_unblock_event(report):
    """
    Emit daily unblock event to EventBridge
    """
    try:
        eventbridge = boto3.client('events')
        event_bus_name = os.environ['EVENT_BUS_NAME']
        
        response = eventbridge.put_events(
            Entries=[
                {
                    'Source': 'clos.daily-rhythm',
                    'DetailType': 'Daily Unblock Report',
                    'Detail': json.dumps(report),
                    'EventBusName': event_bus_name
                }
            ]
        )
        
        if response['FailedEntryCount'] == 0:
            return {'status': 'success', 'event_id': response['Entries'][0]['EventId']}
        else:
            return {'status': 'failed', 'error': response['Entries'][0]['ErrorMessage']}
            
    except Exception as e:
        logger.error(f"Failed to emit unblock event: {str(e)}")
        return {'status': 'error', 'error': str(e)}

def emit_weekly_demo_event(demo_report):
    """
    Emit weekly demo event to EventBridge
    """
    try:
        eventbridge = boto3.client('events')
        event_bus_name = os.environ['EVENT_BUS_NAME']
        
        response = eventbridge.put_events(
            Entries=[
                {
                    'Source': 'clos.weekly-rhythm',
                    'DetailType': 'Weekly Demo Preparation',
                    'Detail': json.dumps(demo_report),
                    'EventBusName': event_bus_name
                }
            ]
        )
        
        if response['FailedEntryCount'] == 0:
            return {'status': 'success', 'event_id': response['Entries'][0]['EventId']}
        else:
            return {'status': 'failed', 'error': response['Entries'][0]['ErrorMessage']}
            
    except Exception as e:
        logger.error(f"Failed to emit demo event: {str(e)}")
        return {'status': 'error', 'error': str(e)}