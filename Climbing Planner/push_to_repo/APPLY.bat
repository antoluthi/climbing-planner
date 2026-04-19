@echo off
SET REPO=C:\Users\anton\OneDrive\Bureau\Planif\ClaudeCode
SET HERE=%~dp0

echo === Pull des derniers commits GitHub ===
cd /D "%REPO%"
git pull --rebase origin claudecode
if %ERRORLEVEL% NEQ 0 (
    echo ERREUR lors du git pull. Resoudre les conflits manuellement.
    pause
    exit /b 1
)

echo.
echo === Copie des fichiers depuis push_to_repo ===

mkdir "%REPO%\src\components" 2>nul
mkdir "%REPO%\src\hooks" 2>nul
mkdir "%REPO%\src\lib" 2>nul
mkdir "%REPO%\src\theme" 2>nul
mkdir "%REPO%\supabase\migrations" 2>nul

copy /Y "%HERE%src\climbing-planner-new.jsx" "%REPO%\src\climbing-planner-new.jsx"
copy /Y "%HERE%src\components\AccueilView.jsx" "%REPO%\src\components\AccueilView.jsx"
copy /Y "%HERE%src\components\AddSessionChoiceModal.jsx" "%REPO%\src\components\AddSessionChoiceModal.jsx"
copy /Y "%HERE%src\components\CustomCheckbox.jsx" "%REPO%\src\components\CustomCheckbox.jsx"
copy /Y "%HERE%src\components\DayColumn.jsx" "%REPO%\src\components\DayColumn.jsx"
copy /Y "%HERE%src\components\DeadlineDetailModal.jsx" "%REPO%\src\components\DeadlineDetailModal.jsx"
copy /Y "%HERE%src\components\DeadlineModal.jsx" "%REPO%\src\components\DeadlineModal.jsx"
copy /Y "%HERE%src\components\QuickSessionModal.jsx" "%REPO%\src\components\QuickSessionModal.jsx"
copy /Y "%HERE%src\components\SessionModal.jsx" "%REPO%\src\components\SessionModal.jsx"
copy /Y "%HERE%src\hooks\useSupabaseSync.js" "%REPO%\src\hooks\useSupabaseSync.js"
copy /Y "%HERE%src\lib\storage.js" "%REPO%\src\lib\storage.js"
copy /Y "%HERE%src\theme\makeStyles.js" "%REPO%\src\theme\makeStyles.js"
copy /Y "%HERE%supabase\migrations\20260331_realtime_climbing_plans.sql" "%REPO%\supabase\migrations\20260331_realtime_climbing_plans.sql"

echo.
echo === Commit et push ===
cd /D "%REPO%"
git add -A
git commit -m "feat: quickSessions, deadlines, AddSessionChoiceModal, DeadlineModal, QuickSessionModal"
git push origin claudecode

echo.
echo === Done ! Vercel va rebuilder automatiquement. ===
pause
