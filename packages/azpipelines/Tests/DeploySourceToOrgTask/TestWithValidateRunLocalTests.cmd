
SET INPUT_TARGET_ORG=MyScratchOrg
SET INPUT_SOURCE_DIRECTORY=force-di
SET INPUT_PROJECT_DIRECTORY=..\..\..\..\tests\force-di
SET INPUT_WAIT_TIME=60
SET INPUT_CHECKONLY=true
SET INPUT_TESTLEVEL=RunLocalTests
SET INPUT_VALIDATION_IGNORE=..\..\..\..\tests\force-di\.validationignore
SET INPUT_ISTOBREAKBUILDIFEMPTY=true







ts-node --project  ..\..\BuildTasks\DeploySourceToOrgTask\tsconfig.json  ..\..\BuildTasks\DeploySourceToOrgTask\DeploySourceToOrg

