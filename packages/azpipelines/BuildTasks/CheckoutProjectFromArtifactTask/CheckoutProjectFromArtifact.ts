import tl = require("azure-pipelines-task-lib/task");
var fs = require("fs-extra");
const path = require("path");
import simplegit from "simple-git/promise";
import { isNullOrUndefined } from "util";
import { stringify } from "querystring";
var shell = require("shelljs");
const https = require("https");

async function run() {
  try {
    const artifact = tl.getInput("artifact", true);
    const artifact_type = tl.getInput("typeOfArtifact", true);
    const attachedArtifactType = tl.getInput("attachedArtifactType", true);
    let packageName = tl.getInput("package", false);
    let package_version_id_file_path: string;
    let version_control_provider: string;
    let token: string;
    let scheme: string;
    let username: string;

    //Read Git User Endpoint
    if (artifact_type != "delta") {
      version_control_provider = tl.getInput("versionControlProvider", true);

      let connection: string;
      switch (version_control_provider) {
        case "github":
          connection = tl.getInput("github_connection", true);
          break;
        case "githubEnterprise":
          connection = tl.getInput("github_enterprise_connection", true);
          break;
        case "bitbucket":
          connection = tl.getInput("bitbucket_connection", true);
          break;
      }

      if (version_control_provider == "azureRepo") {
        token = tl.getVariable("system.accessToken");
      } else if (
        version_control_provider == "github" ||
        version_control_provider == "githubEnterprise"
      ) {
        let githubEndpoint: {
          token: string;
          scheme: string;
        } = getGithubEndPointToken(connection);
        token = githubEndpoint.token;
        scheme = githubEndpoint.scheme;
      } else if (version_control_provider == "bitbucket") {
        token = tl.getEndpointAuthorizationParameter(
          connection,
          "AccessToken",
          true
        );
      } else {
        username = tl.getInput("username", true);
        token = tl.getInput("password", true);
      }
    }

    //Read Artifact Metadata
    let artifact_directory = tl.getVariable("system.artifactsDirectory");

    //For Backward Compatibility, packageName could be null when upgraded
    let artifactFileNameSelector = isNullOrUndefined(packageName)
      ? "artifact_metadata"
      : packageName + "_artifact_metadata";

    if (attachedArtifactType == "AzureArtifact") {
      package_version_id_file_path = path.join(
        artifact_directory,
        artifact,
        artifactFileNameSelector
      );
    } else {
      package_version_id_file_path = path.join(
        artifact_directory,
        artifact,
        "sfpowerkit_artifact",
        artifactFileNameSelector
      );
    }

    let package_metadata_json = fs
      .readFileSync(package_version_id_file_path)
      .toString();

    let package_metadata = JSON.parse(package_metadata_json);

    //Create Location

    //For Backward Compatibility, packageName could be null when upgraded
    let local_source_directory = isNullOrUndefined(packageName)
      ? path.join(artifact_directory, artifact, "source")
      : path.join(artifact_directory, artifact, packageName, "source");

    shell.mkdir("-p", local_source_directory);

    console.log(`Source Directory created at ${local_source_directory}`);
    console.log(`The Package Type : ${package_metadata.package_type}`);

    if (
      package_metadata.package_type === "source" ||
      package_metadata.package_type === "unlocked"
    ) {
      //Strinp https
      const removeHttps = (input) => input.replace(/^https?:\/\//, "");

      let repository_url = removeHttps(package_metadata.repository_url);

      const git = simplegit(local_source_directory);

      let remote: string;
      if (version_control_provider == "azureRepo") {
        //Fix Issue https://developercommunity.visualstudio.com/content/problem/411770/devops-git-url.html
        repository_url = repository_url.substring(
          repository_url.indexOf("@") + 1
        );
        remote = `https://x-token-auth:${token}@${repository_url}`;
      } else if (version_control_provider == "bitbucket") {
        remote = `https://x-token-auth:${token}@${repository_url}`;
      } else if (
        version_control_provider == "github" ||
        version_control_provider == "githubEnterprise"
      ) {
        if (scheme === "InstallationToken") {
          remote = `https://x-access-token:${token}@${repository_url}`;
        } else remote = `https://${token}:x-oauth-basic@${repository_url}`;
      } else if (version_control_provider == "otherGit") {
        remote = `https://${username}:${token}@${repository_url}`;
      }

      await git.silent(false).clone(remote, local_source_directory);
      await git.checkout(package_metadata.sourceVersion);

      console.log(`Checked Out ${package_metadata.sourceVersion} sucessfully`);
    } else if (package_metadata.package_type === "delta") {
      //For Backward Compatibility, packageName could be null when upgraded
      let delta_artifact_location = isNullOrUndefined(packageName)
        ? path.join(
            artifact_directory,
            artifact,
            "sfpowerscripts_delta_package"
          )
        : path.join(
            artifact_directory,
            artifact,
            `${packageName}_sfpowerscripts_delta_package`
          );

      tl.debug(`Delta Directory is at ${delta_artifact_location}`);

      tl.debug("Files in Delta Location");
      fs.readdirSync(delta_artifact_location).forEach((file) => {
        tl.debug(file);
      });

      tl.debug("Copying Files to a source directory");
      fs.copySync(delta_artifact_location, local_source_directory, {
        overwrite: true,
      });
    }

    console.log("Files in source Location");
    fs.readdirSync(local_source_directory).forEach((file) => {
      console.log(file);
    });

    tl.setVariable("sfpowerscripts_checked_out_path", local_source_directory);
  } catch (err) {
    tl.setResult(tl.TaskResult.Failed, err.message);
  }
}

function getGithubEndPointToken(
  githubEndpoint: string
): { token: string; scheme: string } {
  const githubEndpointObject = tl.getEndpointAuthorization(
    githubEndpoint,
    false
  );
  let githubEndpointToken: string = null;

  if (!!githubEndpointObject) {
    tl.debug("Endpoint scheme: " + githubEndpointObject.scheme);

    if (githubEndpointObject.scheme === "PersonalAccessToken") {
      githubEndpointToken = githubEndpointObject.parameters.accessToken;
    } else if (githubEndpointObject.scheme === "OAuth") {
      githubEndpointToken = githubEndpointObject.parameters.AccessToken;
    } else if (githubEndpointObject.scheme === "Token") {
      githubEndpointToken = githubEndpointObject.parameters.AccessToken;
    } else if (githubEndpointObject.scheme) {
      let idToken = githubEndpointObject.parameters.IdToken;
      let idSignature = githubEndpointObject.parameters.IdSignature;
      getGithubAccessTokenFromInstalledApp(idToken, idSignature);
    }
  }

  if (!githubEndpointToken) {
    throw new Error(tl.loc("InvalidGitHubEndpoint", githubEndpoint));
  }

  return { token: githubEndpointToken, scheme: githubEndpointObject.scheme };
}

function getGithubAccessTokenFromInstalledApp(
  idToken: string,
  idSignature: string
) {
  const options = {
    hostname: "api.github.com",
    port: 443,
    path: `app/installations/:${idToken}/access_tokens`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${idSignature}`,
      Accept: `application/vnd.github.machine-man-preview+json`,
    },
  };

  const req = https.request(options, (res) => {
    console.log(`statusCode: ${res.statusCode}`);

    res.on("data", (d) => {
      process.stdout.write(d);
    });
  });

  req.on("error", (error) => {
    console.error(error);
  });

  req.end();
}

run();
