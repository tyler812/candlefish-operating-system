import json
import boto3
import psycopg2
import logging
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def handler(event, context):
    """
    Initialize the CLOS v2.0 database with required tables and schema
    """
    try:
        # Get database credentials from Secrets Manager
        secret_arn = context['SECRET_ARN']
        secrets_client = boto3.client('secretsmanager')
        
        secret_response = secrets_client.get_secret_value(SecretId=secret_arn)
        secret = json.loads(secret_response['SecretString'])
        
        # Database connection parameters
        db_params = {
            'host': context['DATABASE_HOST'],
            'database': context['DATABASE_NAME'],
            'user': secret['username'],
            'password': secret['password'],
            'port': 5432
        }
        
        # Connect to database
        logger.info("Connecting to database...")
        conn = psycopg2.connect(**db_params)
        cur = conn.cursor()
        
        # Create extensions
        logger.info("Creating database extensions...")
        cur.execute("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";")
        cur.execute("CREATE EXTENSION IF NOT EXISTS \"pg_stat_statements\";")
        
        # Create enums
        logger.info("Creating enum types...")
        create_enums = """
        DO $$ BEGIN
            CREATE TYPE stage_type AS ENUM (
                'inception', 'problem_definition', 'solution_design',
                'development', 'testing', 'deployment', 'monitoring'
            );
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
        
        DO $$ BEGIN
            CREATE TYPE wip_type AS ENUM (
                'idea', 'project', 'pull_request', 'deployment', 'issue'
            );
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
        
        DO $$ BEGIN
            CREATE TYPE idea_status AS ENUM (
                'pending', 'evaluating', 'approved', 'rejected', 'promoted'
            );
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
        
        DO $$ BEGIN
            CREATE TYPE pod_status AS ENUM (
                'active', 'inactive', 'maintenance'
            );
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
        """
        cur.execute(create_enums)
        
        # Create core tables
        logger.info("Creating core tables...")
        
        # Users table
        cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            email VARCHAR(255) UNIQUE NOT NULL,
            name VARCHAR(255) NOT NULL,
            role VARCHAR(100) DEFAULT 'developer',
            pod_id UUID,
            active BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
        """)
        
        # Pods table
        cur.execute("""
        CREATE TABLE IF NOT EXISTS pods (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name VARCHAR(255) NOT NULL UNIQUE,
            description TEXT,
            lead_id UUID REFERENCES users(id),
            status pod_status DEFAULT 'active',
            wip_limits JSONB DEFAULT '{}',
            health_score DECIMAL(3,2) DEFAULT 100.00,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
        """)
        
        # Add foreign key constraint to users table
        cur.execute("""
        DO $$ BEGIN
            ALTER TABLE users ADD CONSTRAINT fk_users_pod_id 
                FOREIGN KEY (pod_id) REFERENCES pods(id);
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
        """)
        
        # Projects table
        cur.execute("""
        CREATE TABLE IF NOT EXISTS projects (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name VARCHAR(255) NOT NULL,
            description TEXT,
            pod_id UUID REFERENCES pods(id),
            current_stage stage_type NOT NULL DEFAULT 'inception',
            wip_lock_id UUID,
            github_repo VARCHAR(255),
            deployed_url VARCHAR(255),
            health_score DECIMAL(3,2) DEFAULT 100.00,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
        """)
        
        # Stage transitions table
        cur.execute("""
        CREATE TABLE IF NOT EXISTS stage_transitions (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
            from_stage stage_type,
            to_stage stage_type NOT NULL,
            evidence JSONB NOT NULL DEFAULT '{}',
            approved_by UUID REFERENCES users(id),
            approved_at TIMESTAMP DEFAULT NOW(),
            notes TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        );
        """)
        
        # WIP locks table
        cur.execute("""
        CREATE TABLE IF NOT EXISTS wip_locks (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            pod_id UUID REFERENCES pods(id) ON DELETE CASCADE,
            item_type wip_type NOT NULL,
            item_id VARCHAR(255) NOT NULL,
            acquired_by UUID REFERENCES users(id),
            acquired_at TIMESTAMP DEFAULT NOW(),
            released_at TIMESTAMP,
            expires_at TIMESTAMP,
            UNIQUE(pod_id, item_type, item_id)
        );
        """)
        
        # Ideas table
        cur.execute("""
        CREATE TABLE IF NOT EXISTS ideas (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            title VARCHAR(500) NOT NULL,
            description TEXT,
            submitted_by UUID REFERENCES users(id),
            evaluation_score DECIMAL(3,2),
            status idea_status DEFAULT 'pending',
            promoted_to_project_id UUID REFERENCES projects(id),
            tags JSONB DEFAULT '[]',
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
        """)
        
        # Activities table for audit log
        cur.execute("""
        CREATE TABLE IF NOT EXISTS activities (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID REFERENCES users(id),
            action VARCHAR(100) NOT NULL,
            resource_type VARCHAR(100),
            resource_id UUID,
            details JSONB DEFAULT '{}',
            ip_address INET,
            user_agent TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        );
        """)
        
        # Metrics table
        cur.execute("""
        CREATE TABLE IF NOT EXISTS metrics (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            pod_id UUID REFERENCES pods(id),
            metric_type VARCHAR(100) NOT NULL,
            metric_value DECIMAL(10,4) NOT NULL,
            dimensions JSONB DEFAULT '{}',
            timestamp TIMESTAMP DEFAULT NOW(),
            created_at TIMESTAMP DEFAULT NOW()
        );
        """)
        
        # Create indexes for performance
        logger.info("Creating database indexes...")
        indexes = [
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_pod_id ON projects(pod_id);",
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_current_stage ON projects(current_stage);",
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stage_transitions_project_id ON stage_transitions(project_id);",
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wip_locks_pod_id ON wip_locks(pod_id);",
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wip_locks_item_type ON wip_locks(item_type);",
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ideas_status ON ideas(status);",
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ideas_submitted_by ON ideas(submitted_by);",
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activities_user_id ON activities(user_id);",
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activities_created_at ON activities(created_at);",
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_metrics_pod_id ON metrics(pod_id);",
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp);",
        ]
        
        for index_sql in indexes:
            try:
                cur.execute(index_sql)
            except psycopg2.Error as e:
                logger.warning(f"Index creation failed (might already exist): {e}")
        
        # Create initial data
        logger.info("Inserting initial data...")
        
        # Create default pods
        cur.execute("""
        INSERT INTO pods (name, description, wip_limits) VALUES
            ('Ratio', 'Core architecture and infrastructure pod', '{"projects": 3, "pull_requests": 5}'),
            ('Nanda', 'AI and automation systems pod', '{"projects": 2, "pull_requests": 4}'),
            ('Meta', 'Operations and process optimization pod', '{"projects": 2, "pull_requests": 3}')
        ON CONFLICT (name) DO NOTHING;
        """)
        
        # Create system user
        cur.execute("""
        INSERT INTO users (email, name, role) VALUES
            ('system@candlefish.ai', 'System User', 'system')
        ON CONFLICT (email) DO NOTHING;
        """)
        
        # Commit all changes
        conn.commit()
        logger.info("Database initialization completed successfully")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Database initialized successfully',
                'tables_created': [
                    'users', 'pods', 'projects', 'stage_transitions',
                    'wip_locks', 'ideas', 'activities', 'metrics'
                ]
            })
        }
        
    except Exception as e:
        logger.error(f"Database initialization failed: {str(e)}")
        if 'conn' in locals():
            conn.rollback()
        
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': f'Database initialization failed: {str(e)}'
            })
        }
    
    finally:
        if 'cur' in locals():
            cur.close()
        if 'conn' in locals():
            conn.close()