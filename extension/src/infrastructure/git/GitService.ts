import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';
import { Logger } from '../../utils/Logger';

function run(command: string, cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
        exec(command, { cwd, maxBuffer: 1024 * 1024 * 20 }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr || error.message));
                return;
            }
            resolve(stdout);
        });
    });
}

/**
 * Git ile ilgili işlemleri (repo kökünü bulma, HEAD'deki dosya içeriğini okuma,
 * dosyayı HEAD haline döndürme) yönetir.
 */
export class GitService {
    /** Verilen dosyanın ait olduğu git repo kökünü bulur. Repo değilse null döner. */
    public static async getRepoRoot(fileUri: vscode.Uri): Promise<string | null> {
        const dir = path.dirname(fileUri.fsPath);
        try {
            const out = await run('git rev-parse --show-toplevel', dir);
            return out.trim();
        } catch {
            return null;
        }
    }

    /** Dosyanın son commit (HEAD)'teki içeriğini döner. Dosya yeni/untracked ise null döner. */
    public static async getHeadContent(fileUri: vscode.Uri): Promise<string | null> {
        const repoRoot = await this.getRepoRoot(fileUri);
        if (!repoRoot) {
            Logger.warn('Bu dosya bir git deposu içinde değil.');
            return null;
        }

        const relPath = path.relative(repoRoot, fileUri.fsPath).split(path.sep).join('/');

        try {
            const out = await run(`git show HEAD:"${relPath}"`, repoRoot);
            return out;
        } catch (err) {
            // Dosya HEAD'de yok (yeni eklenmiş / henüz commit'lenmemiş dosya)
            Logger.debug(`Dosya HEAD'de bulunamadı (yeni dosya olabilir): ${relPath}`);
            return null;
        }
    }

    /** Dosyayı git'teki HEAD haline sıfırlar (çalışma kopyasındaki değişiklikleri atar). */
    public static async discardChanges(fileUri: vscode.Uri): Promise<void> {
        const repoRoot = await this.getRepoRoot(fileUri);
        if (!repoRoot) return;

        const relPath = path.relative(repoRoot, fileUri.fsPath).split(path.sep).join('/');
        await run(`git checkout -- "${relPath}"`, repoRoot);
    }

    /**
     * VS Code'un yerleşik Git eklentisinin API'sini alır.
     * (Bu eklenti her VS Code kurulumunda hazır gelir, ekstra bağımlılık gerekmez.)
     */
    private static async getGitApi(): Promise<any | null> {
        const gitExtension = vscode.extensions.getExtension('vscode.git');
        if (!gitExtension) {
            Logger.warn('VS Code Git eklentisi (vscode.git) bulunamadı.');
            return null;
        }
        if (!gitExtension.isActive) {
            await gitExtension.activate();
        }
        return gitExtension.exports.getAPI(1);
    }

    /**
     * Aktif çalışma alanındaki (ilk) Git deposunda stage edilmiş (git add ile eklenmiş)
     * değişikliklerin diff çıktısını döner. Stage edilmiş değişiklik yoksa null döner.
     */
    public static async getStagedDiff(): Promise<string | null> {
        const api = await this.getGitApi();
        if (!api || api.repositories.length === 0) {
            vscode.window.showWarningMessage('Açık bir Git deposu bulunamadı.');
            return null;
        }

        // Şimdilik ilk (veya aktif dosyaya en yakın) depoyu kullanıyoruz
        const repo = api.repositories[0];
        const repoRoot: string = repo.rootUri.fsPath;

        try {
            const diff = await run('git diff --staged', repoRoot);
            if (!diff.trim()) {
                vscode.window.showInformationMessage('Stage edilmiş (git add ile eklenmiş) bir değişiklik bulunamadı.');
                return null;
            }
            return diff;
        } catch (err) {
            Logger.warn(`Staged diff alınamadı: ${err}`);
            vscode.window.showErrorMessage('Git diff alınırken bir hata oluştu.');
            return null;
        }
    }

    /**
     * Üretilen commit mesajını, Source Control panelindeki Git input kutusuna yazar.
     */
    public static async setCommitMessage(message: string): Promise<void> {
        const api = await this.getGitApi();
        if (!api || api.repositories.length === 0) {
            vscode.window.showWarningMessage('Commit mesajı yazılacak bir Git deposu bulunamadı.');
            return;
        }

        const repo = api.repositories[0];
        repo.inputBox.value = message;
    }
}