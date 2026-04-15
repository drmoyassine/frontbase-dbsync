import asyncio
from sqlalchemy.orm import Session
from app.database.config import SessionLocal
from app.services.vercel_deploy_api import list_deployments, get_deployment_events
from app.models.models import EdgeProviderAccount
from app.core.security import get_provider_creds

async def main():
    db = SessionLocal()
    provider = db.query(EdgeProviderAccount).filter(EdgeProviderAccount.provider == 'vercel').first()
    if not provider:
        print('No Vercel provider found')
        return
    creds = get_provider_creds(str(provider.id), db)
    api_token = creds.get('api_token')
    team_id = creds.get('team_id')

    deps = await list_deployments(api_token, 'vercel-localtest-frontbase-edge', team_id)
    if not deps:
        print('No deployments found')
        return
    
    latest = deps[0]
    print('Latest Deployment State:', latest.get('state'))
    print('URL:', latest.get('url'))
    print('Error:', latest.get('error'))
    
    events = await get_deployment_events(api_token, latest.get('uid'), team_id)
    print('--- Events ---')
    for event in events[-30:]:
        print(f'[{event.get("type", "")}] {str(event.get("text", "")).strip()}')

asyncio.run(main())
