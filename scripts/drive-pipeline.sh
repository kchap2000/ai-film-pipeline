#!/bin/bash
# Drive the auto-pipeline orchestrator until it reaches video_clips (or errors).
# Usage: drive-pipeline.sh <project_id> [stop_step]
BASE="https://ai-film-pipeline-git-main-khalil-chapmans-projects.vercel.app"
PROJECT="$1"
STOP="${2:-video_clips}"

for i in $(seq 1 120); do
  RES=$(curl -s -X POST "$BASE/api/projects/$PROJECT/auto-pipeline" \
    -H "Content-Type: application/json" -d '{"action":"step"}' --max-time 295)
  STEP=$(echo "$RES" | python3 -c "import json,sys
try:
  d=json.load(sys.stdin)
  r=d.get('run',{})
  print(r.get('current_step',''), r.get('status',''), (d.get('work') or '')[:120].replace('\n',' '))
except Exception as e:
  print('PARSE_ERR', e)" 2>/dev/null)
  echo "[$i] $STEP"
  CUR=$(echo "$STEP" | awk '{print $1}')
  STATUS=$(echo "$STEP" | awk '{print $2}')
  if [ "$CUR" = "$STOP" ] || [ "$CUR" = "done" ] || [ "$STATUS" = "failed" ] || [ "$STATUS" = "paused" ] || [ "$CUR" = "PARSE_ERR" ]; then
    echo "STOPPING at step=$CUR status=$STATUS"
    echo "$RES" | head -c 1500
    break
  fi
  sleep 2
done
