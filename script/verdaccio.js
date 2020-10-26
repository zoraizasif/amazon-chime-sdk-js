/*
    Verdaccio app script
    This script will install and spin up a verdaccio server, which acts as a "dry-run" npm publishing tool.
    We will publish our npm module to our locally hosted verdaccio server the same way we would publish to the npm registry.
    Then we will modify the demo app to pull the sdk npm module from verdaccio, install it, and run the 
    demo app with the module hosted in our local verdaccio server.
    Once the demo app is running the script will hang - waiting for manual verification steps to be completed - and after testing
    is finished the user can type 'yes' to allow the script to clean up and finish.
*/
const {
    logger,
    spawnOrFail,
    process,
    shouldContinuePrompt
  } = require('./utilities');
  const path = require('path');
  const cp = require('child_process');
  const fs = require('fs');
  const PORT = 4873;
  const verdaccioEndpoint = `http://localhost:${PORT}`;
  const verdaccioAppDir = path.join(__dirname, '../../verdaccio_app');
  const sdkTestDir = './test-chime-sdk-js';
  const SDK_APP_NAME = 'amazon-chime-sdk-js';
  const applicationProcesses = [];

  const cleanupBeforeExit = () => {
    logger.log('Terminating processes...');
    applicationProcesses.map(process => {
      logger.log(`Killing process: ${process.pid}`);
      spawnOrFail('kill', [`kill -9`, `${process.pid}`]);
    });
    spawnOrFail('ps', [
      `-ef | grep -E '(webpack|verdaccio)' | grep -v grep | awk '{ print $2 }' | xargs kill -9`
  ]);
    process.exit(0);
  };
  
  process.on('SIGTERM', () => {
    logger.warn("Received SIGTERM, cleaning up.")
    cleanupBeforeExit();
  });  
  process.on('SIGINT', () => {
    logger.warn("Received SIGINT, cleaning up.")
    cleanupBeforeExit();
  });
  process.on('error', (e) => {
      logger.error(`Error received: ${e}`);
      cleanupBeforeExit();
  })
  
  // Create verdaccio testing directory and cd in to it
  if (!fs.existsSync(verdaccioAppDir)) {
    logger.log(`Creating verdaccio directory: ${verdaccioAppDir}`);
    fs.mkdirSync(verdaccioAppDir);
  }
  
  //  Go to verdaccio dir
  logger.log(`Change directory to verdaccio directory: ${verdaccioAppDir}`);
  process.chdir(verdaccioAppDir);

  // Initiate basic node package
  logger.log(`Creating basic node package`);
  spawnOrFail('npm', ['init', '-f', '-y']);
  
  // Install verdaccio within new package
  logger.log(`Installing Verdaccio`);
  spawnOrFail('npm', ['i', 'verdaccio']);
  
  generateVerdaccioConfigFile();
  
  // Start verdaccio application
  try {
    startVerdaccioApp();
  } catch (e) {
    logger.error('Failed to start verdaccio', e);
  }
  
  // Make SDK test directory
  if (!fs.existsSync(sdkTestDir)) {
    logger.log(`Creating SDK testing directory: ${sdkTestDir}`);
    fs.mkdirSync(sdkTestDir);
  } else {
    logger.log(`SDK testing directory already exists: ${sdkTestDir}`);
  }

  logger.log(`Navigate to SDK testing directory: ${sdkTestDir}`);
  process.chdir(sdkTestDir);
  
  // Clone SDK from github
  logger.log(`Cloning ${SDK_APP_NAME} into ${sdkTestDir}`);
  
  //Clean up
  spawnOrFail('rm', ['-rf', `${SDK_APP_NAME}`]);
  spawnOrFail('git', [
    'clone',
    'git@github.com:aws/amazon-chime-sdk-js.git'
  ]);
  // navigate in to cloned SDK
  process.chdir(path.join(`./${SDK_APP_NAME}`));
  
  // Update package.json version
  let package = fs.readFileSync('package.json', 'utf-8');

  const packageJson = JSON.parse(package);
  const originalVersion = packageJson.version;
  const versions = originalVersion.split('.').map(x => parseInt(x));
  versions[2] += 1;
  const newVersion = versions.join('.');

  logger.log(`Changing version number from ${originalVersion} to ${newVersion}`);

  // Update version to new version
  let versionFile = fs.readFileSync('./src/versioning/Versioning.ts', 'utf-8');
  fs.writeFileSync('./src/versioning/Versioning.ts', versionFile.replace('return VERSION.semverString;', `return '${newVersion};'`));
  fs.writeFileSync('package.json', package.replace(originalVersion, newVersion));
  package = fs.readFileSync('package.json', 'utf-8');

  logger.log(`Temporarily removing prepublishOnly and postpublish`);
  fs.writeFileSync('package.json', package.replace(`"postpublish": "script/postpublish",`, ""));
  package = fs.readFileSync('package.json', 'utf-8');
  fs.writeFileSync('package.json', package.replace(`"prepublishOnly": "script/publish",`, ""));
  
  logger.log('Installing dependencies...');
  spawnOrFail('npm', ['install']);
  logger.log('Building...');
  spawnOrFail('npm', ['run', 'build']);

  try {
    // Cleanup package before publishing new
    logger.log('Unpublishing any existing packages from verdaccio.');
    spawnOrFail('npm', [`unpublish`, '--registry', `${verdaccioEndpoint}`, '--force']);
  } catch {
    logger.log('No existing npm module in verdaccio.');
  }
  logger.log('Publishing package to verdaccio.');
  spawnOrFail('npm', [`publish`, '--registry', `${verdaccioEndpoint}`]);
  
  process.chdir('./demos/browser');

  spawnOrFail('npm', [`uninstall ${SDK_APP_NAME}`]);

  //  Install SDK components package from local repo.
  logger.log(`Installing ${SDK_APP_NAME} from local verdaccio server...`);
  spawnOrFail('npm', [`install ${SDK_APP_NAME} --registry ${verdaccioEndpoint}`]);

  let meetingV2File = fs.readFileSync('app/meetingV2/meetingV2.ts', 'utf-8');
  fs.writeFileSync('app/meetingV2/meetingV2.ts', meetingV2File.replace('../../../../src/index', 'amazon-chime-sdk-js'));

  logger.log(`Installing and Building...`);
  cp.execSync('cd ../.. && npm run build');
  cp.execSync('npm install');
  cp.execSync('npm install aws-sdk');
  cp.execSync('npm run build');
  const demoAppClientProcess = cp.exec('node server.js');
  applicationProcesses.push(demoAppClientProcess);
  
  logger.log(`
      Starting V1 meeting demo app. Please wait for the server to start up.
      App will be running on: http://127.0.0.1:8080/
  
      Once application is loaded verify that its working properly.
      `);
  
  logger.warn(
    `Have you completed the demo app manual verification steps and are ready to continue with RELEASE?`
  );
  shouldContinuePrompt(cleanupBeforeExit);
  cleanupBeforeExit();

  function startVerdaccioApp() {
    // Start verdaccio with config from above.
    const verdaccioProcess = cp.exec(
      `${verdaccioAppDir}/node_modules/verdaccio/bin/verdaccio -c config.yaml`);
    logger.log(`Verdaccio server started on http://localhost:${PORT}`);
    applicationProcesses.push(verdaccioProcess);
  }
  
  function generateVerdaccioConfigFile() {
    // Create Verdaccio config file
    logger.log("Creating config file for Verdaccio");
    fs.writeFileSync(
      'config.yaml',
      `
  #
  # This is the default config file. It allows all users to do anything,
  # so don't use it on production systems.
  #
  # Look here for more config file examples:
  # https://github.com/verdaccio/verdaccio/tree/master/conf
  #
  # path to a directory with all packages
  storage: ./storage
  # a list of other known repositories we can talk to
  uplinks:
    npmjs:
      url: https://registry.npmjs.org/
  packages:
    '@*/*':
      # scoped packages
      access: $all
      proxy: npmjs
    '**':
      # allow all users (including non-authenticated users) to read and
      # publish all packages
      #
      # you can specify usernames/groupnames (depending on your auth plugin)
      # and three keywords: "$all", "$anonymous", "$authenticated"
      access: $all
      # allow all known users to publish packages
      publish: $all
      proxy: npmjs
  `,
      function(err) {
        if (err) throw err;
        logger.log('config file is generated successfully.');
      }
    );
  }

  