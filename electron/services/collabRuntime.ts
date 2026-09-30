import { projectStore } from './projectStore'
import { GitHubService } from './githubService'
import { CollaborationService } from './collaboration'

export const githubService = new GitHubService(projectStore.getConfigDir())
export const collaborationService = new CollaborationService(githubService)
