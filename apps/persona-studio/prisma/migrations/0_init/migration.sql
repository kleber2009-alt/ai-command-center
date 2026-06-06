-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "name" TEXT,
    "image" TEXT,
    "tokenBalance" INTEGER NOT NULL DEFAULT 0,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "role" TEXT NOT NULL DEFAULT 'user',
    "telegramId" TEXT,
    "telegramHandle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "hashedKey" TEXT NOT NULL,
    "scopes" TEXT NOT NULL DEFAULT 'read,write',
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvatarGeneration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "tokensCost" INTEGER NOT NULL DEFAULT 10,
    "jobId" TEXT,
    "errorMsg" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvatarGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Avatar" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imageThumbUrl" TEXT,
    "style" TEXT NOT NULL,
    "styleLabel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "promptUsed" TEXT,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Avatar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoGeneration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "avatarId" TEXT NOT NULL,
    "engine" TEXT NOT NULL DEFAULT 'heygen-v5',
    "script" TEXT,
    "audioUrl" TEXT,
    "language" TEXT NOT NULL DEFAULT 'ru',
    "voiceId" TEXT,
    "aspect" TEXT NOT NULL DEFAULT '9:16',
    "quality" TEXT NOT NULL DEFAULT '2k',
    "background" TEXT,
    "subtitles" BOOLEAN NOT NULL DEFAULT true,
    "heygenVersion" TEXT NOT NULL DEFAULT 'V',
    "motionPrompt" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "engineJobId" TEXT,
    "heygenJobId" TEXT,
    "videoUrl" TEXT,
    "tokensCost" INTEGER NOT NULL DEFAULT 30,
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "VideoGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoEdit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "videoGenerationId" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "subtitlesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "subtitleLanguage" TEXT NOT NULL DEFAULT 'ru',
    "brollsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "submagicProjectId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resultUrl" TEXT,
    "tokensCost" INTEGER NOT NULL DEFAULT 15,
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "VideoEdit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cover" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "avatarId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "cta" TEXT,
    "niche" TEXT,
    "style" TEXT NOT NULL DEFAULT 'ai-visionary',
    "aspect" TEXT NOT NULL DEFAULT '4:5',
    "imageUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "promptUsed" TEXT,
    "tokensCost" INTEGER NOT NULL DEFAULT 3,
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Cover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParserConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nicheDescription" TEXT,
    "competitors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "postedWithinDays" INTEGER NOT NULL DEFAULT 7,
    "perTargetLimit" INTEGER NOT NULL DEFAULT 25,
    "minPlays" INTEGER NOT NULL DEFAULT 100000,
    "minLikes" INTEGER NOT NULL DEFAULT 1000,
    "minComments" INTEGER NOT NULL DEFAULT 1000,
    "minShares" INTEGER NOT NULL DEFAULT 1000,
    "minCarouselLikes" INTEGER NOT NULL DEFAULT 1000,
    "minCarouselComments" INTEGER NOT NULL DEFAULT 1000,
    "reelsCount" INTEGER NOT NULL DEFAULT 5,
    "carouselsCount" INTEGER NOT NULL DEFAULT 5,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParserConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParserRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "postsScanned" INTEGER NOT NULL DEFAULT 0,
    "reelsFound" INTEGER NOT NULL DEFAULT 0,
    "carouselsFound" INTEGER NOT NULL DEFAULT 0,
    "claudeSummary" TEXT,
    "errorMsg" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ParserRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParserItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "shortcode" TEXT,
    "kind" TEXT NOT NULL,
    "owner" TEXT,
    "thumbnailUrl" TEXT,
    "caption" TEXT,
    "plays" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "ageHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "velocityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fitScore" INTEGER,
    "fitWhy" TEXT,
    "rewrittenScript" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "videoGenerationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParserItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarouselDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parserItemId" TEXT,
    "coverAvatarId" TEXT,
    "slidesCount" INTEGER NOT NULL DEFAULT 6,
    "style" TEXT NOT NULL DEFAULT 'persona-minimal',
    "slides" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tokensCost" INTEGER NOT NULL DEFAULT 0,
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CarouselDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CryptoInvoice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "pack" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL,
    "asset" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "payUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "CryptoInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchAuthor" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'instagram',
    "username" TEXT NOT NULL,
    "externalId" TEXT,
    "followers" INTEGER,
    "postsCount" INTEGER,
    "avatarUrl" TEXT,
    "profileUrl" TEXT,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "medianViews" DOUBLE PRECISION,
    "medianWindow" INTEGER NOT NULL DEFAULT 30,
    "engagementAvg" DOUBLE PRECISION,
    "lowConfidence" BOOLEAN NOT NULL DEFAULT false,
    "lastIndexedAt" TIMESTAMP(3),
    "rawStats" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchAuthor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchReel" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'instagram',
    "externalId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "videoUrl" TEXT,
    "thumbnailUrl" TEXT,
    "caption" TEXT,
    "captionHash" TEXT,
    "postedAt" TIMESTAMP(3),
    "durationSec" INTEGER,
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "music" TEXT,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "language" TEXT,
    "postType" TEXT NOT NULL DEFAULT 'reel',
    "virality" DOUBLE PRECISION,
    "engagementRate" DOUBLE PRECISION,
    "velocity" DOUBLE PRECISION,
    "viralScore" DOUBLE PRECISION,
    "reach" DOUBLE PRECISION,
    "nicheTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "indexedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchReel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchTranscript" (
    "id" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "lang" TEXT NOT NULL DEFAULT 'ru',
    "text" TEXT NOT NULL,
    "improved" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'stub',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchTranscript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchAnalysis" (
    "id" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hooks" JSONB NOT NULL,
    "storytelling" JSONB NOT NULL,
    "format" JSONB NOT NULL,
    "style" JSONB NOT NULL,
    "whyViral" TEXT NOT NULL,
    "recommendations" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "tokensCost" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchPageAnalysis" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "outliers" JSONB NOT NULL,
    "cadence" JSONB NOT NULL,
    "bestFormats" JSONB NOT NULL,
    "bestTopics" JSONB NOT NULL,
    "recurringHooks" JSONB NOT NULL,
    "recommendations" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "tokensCost" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchPageAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchHook" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "formula" TEXT NOT NULL,
    "sourceReelId" TEXT,
    "niche" TEXT,
    "language" TEXT,
    "sourceViews" INTEGER NOT NULL DEFAULT 0,
    "origin" TEXT NOT NULL DEFAULT 'auto',
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchHook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "reelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchWatchlist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "refreshInterval" INTEGER NOT NULL DEFAULT 24,
    "lastRefreshAt" TIMESTAMP(3),
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchWatchlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchSearchCache" (
    "id" TEXT NOT NULL,
    "niche" TEXT NOT NULL,
    "filtersHash" TEXT NOT NULL,
    "resultReelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "summary" TEXT,
    "expansion" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchSearchCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchSearch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "niche" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "resultReelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "summary" TEXT,
    "cacheHit" BOOLEAN NOT NULL DEFAULT false,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchFolder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchFolderItem" (
    "id" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchFolderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchRadar" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "niche" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "intervalHrs" INTEGER NOT NULL DEFAULT 24,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastResultIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchRadar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchApifyUsage" (
    "month" TEXT NOT NULL,
    "callsMade" INTEGER NOT NULL DEFAULT 0,
    "itemsScraped" INTEGER NOT NULL DEFAULT 0,
    "estCostCents" INTEGER NOT NULL DEFAULT 0,
    "lastAlertPct" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchApifyUsage_pkey" PRIMARY KEY ("month")
);

-- CreateTable
CREATE TABLE "SidebarItemOverride" (
    "itemKey" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SidebarItemOverride_pkey" PRIMARY KEY ("itemKey")
);

-- CreateTable
CREATE TABLE "SocialAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "accessToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "meta" JSONB,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledPost" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "videoGenerationId" TEXT,
    "videoEditId" TEXT,
    "mediaUrl" TEXT NOT NULL,
    "caption" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "publishedAt" TIMESTAMP(3),
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostTarget" (
    "id" TEXT NOT NULL,
    "scheduledPostId" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "remoteId" TEXT,
    "permalink" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorMsg" TEXT,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "PostTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_hashedKey_key" ON "ApiKey"("hashedKey");

-- CreateIndex
CREATE INDEX "ApiKey_userId_createdAt_idx" ON "ApiKey"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ApiKey_hashedKey_idx" ON "ApiKey"("hashedKey");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "Upload_userId_createdAt_idx" ON "Upload"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AvatarGeneration_userId_createdAt_idx" ON "AvatarGeneration"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AvatarGeneration_status_idx" ON "AvatarGeneration"("status");

-- CreateIndex
CREATE INDEX "Avatar_userId_createdAt_idx" ON "Avatar"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Avatar_generationId_style_idx" ON "Avatar"("generationId", "style");

-- CreateIndex
CREATE INDEX "VideoGeneration_userId_createdAt_idx" ON "VideoGeneration"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "VideoEdit_userId_createdAt_idx" ON "VideoEdit"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "VideoEdit_videoGenerationId_idx" ON "VideoEdit"("videoGenerationId");

-- CreateIndex
CREATE INDEX "Cover_userId_createdAt_idx" ON "Cover"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TokenTransaction_userId_createdAt_idx" ON "TokenTransaction"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ParserConfig_userId_key" ON "ParserConfig"("userId");

-- CreateIndex
CREATE INDEX "ParserRun_userId_startedAt_idx" ON "ParserRun"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "ParserItem_userId_createdAt_idx" ON "ParserItem"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ParserItem_runId_idx" ON "ParserItem"("runId");

-- CreateIndex
CREATE INDEX "CarouselDraft_userId_createdAt_idx" ON "CarouselDraft"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CarouselDraft_parserItemId_idx" ON "CarouselDraft"("parserItemId");

-- CreateIndex
CREATE UNIQUE INDEX "CryptoInvoice_invoiceId_key" ON "CryptoInvoice"("invoiceId");

-- CreateIndex
CREATE INDEX "CryptoInvoice_userId_createdAt_idx" ON "CryptoInvoice"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CryptoInvoice_invoiceId_idx" ON "CryptoInvoice"("invoiceId");

-- CreateIndex
CREATE INDEX "ResearchAuthor_lastIndexedAt_idx" ON "ResearchAuthor"("lastIndexedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchAuthor_platform_username_key" ON "ResearchAuthor"("platform", "username");

-- CreateIndex
CREATE INDEX "ResearchReel_authorId_idx" ON "ResearchReel"("authorId");

-- CreateIndex
CREATE INDEX "ResearchReel_viralScore_idx" ON "ResearchReel"("viralScore");

-- CreateIndex
CREATE INDEX "ResearchReel_postedAt_idx" ON "ResearchReel"("postedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchReel_platform_externalId_key" ON "ResearchReel"("platform", "externalId");

-- CreateIndex
CREATE INDEX "ResearchTranscript_reelId_idx" ON "ResearchTranscript"("reelId");

-- CreateIndex
CREATE INDEX "ResearchAnalysis_reelId_createdAt_idx" ON "ResearchAnalysis"("reelId", "createdAt");

-- CreateIndex
CREATE INDEX "ResearchAnalysis_userId_createdAt_idx" ON "ResearchAnalysis"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ResearchPageAnalysis_userId_createdAt_idx" ON "ResearchPageAnalysis"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchPageAnalysis_authorId_userId_key" ON "ResearchPageAnalysis"("authorId", "userId");

-- CreateIndex
CREATE INDEX "ResearchHook_formula_idx" ON "ResearchHook"("formula");

-- CreateIndex
CREATE INDEX "ResearchHook_sourceViews_idx" ON "ResearchHook"("sourceViews");

-- CreateIndex
CREATE INDEX "ResearchHook_userId_createdAt_idx" ON "ResearchHook"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ResearchFavorite_userId_createdAt_idx" ON "ResearchFavorite"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchFavorite_userId_itemType_itemId_key" ON "ResearchFavorite"("userId", "itemType", "itemId");

-- CreateIndex
CREATE INDEX "ResearchWatchlist_lastRefreshAt_idx" ON "ResearchWatchlist"("lastRefreshAt");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchWatchlist_userId_authorId_key" ON "ResearchWatchlist"("userId", "authorId");

-- CreateIndex
CREATE INDEX "ResearchSearchCache_expiresAt_idx" ON "ResearchSearchCache"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchSearchCache_niche_filtersHash_key" ON "ResearchSearchCache"("niche", "filtersHash");

-- CreateIndex
CREATE INDEX "ResearchSearch_userId_createdAt_idx" ON "ResearchSearch"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ResearchFolder_userId_type_idx" ON "ResearchFolder"("userId", "type");

-- CreateIndex
CREATE INDEX "ResearchFolderItem_folderId_createdAt_idx" ON "ResearchFolderItem"("folderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchFolderItem_folderId_itemType_itemId_key" ON "ResearchFolderItem"("folderId", "itemType", "itemId");

-- CreateIndex
CREATE INDEX "ResearchRadar_userId_createdAt_idx" ON "ResearchRadar"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ResearchRadar_enabled_lastRunAt_idx" ON "ResearchRadar"("enabled", "lastRunAt");

-- CreateIndex
CREATE INDEX "SocialAccount_userId_idx" ON "SocialAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccount_userId_platform_externalId_key" ON "SocialAccount"("userId", "platform", "externalId");

-- CreateIndex
CREATE INDEX "ScheduledPost_status_scheduledAt_idx" ON "ScheduledPost"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "ScheduledPost_userId_scheduledAt_idx" ON "ScheduledPost"("userId", "scheduledAt");

-- CreateIndex
CREATE INDEX "PostTarget_scheduledPostId_idx" ON "PostTarget"("scheduledPostId");

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvatarGeneration" ADD CONSTRAINT "AvatarGeneration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvatarGeneration" ADD CONSTRAINT "AvatarGeneration_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "Upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Avatar" ADD CONSTRAINT "Avatar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Avatar" ADD CONSTRAINT "Avatar_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "AvatarGeneration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoGeneration" ADD CONSTRAINT "VideoGeneration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoGeneration" ADD CONSTRAINT "VideoGeneration_avatarId_fkey" FOREIGN KEY ("avatarId") REFERENCES "Avatar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoEdit" ADD CONSTRAINT "VideoEdit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoEdit" ADD CONSTRAINT "VideoEdit_videoGenerationId_fkey" FOREIGN KEY ("videoGenerationId") REFERENCES "VideoGeneration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cover" ADD CONSTRAINT "Cover_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cover" ADD CONSTRAINT "Cover_avatarId_fkey" FOREIGN KEY ("avatarId") REFERENCES "Avatar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenTransaction" ADD CONSTRAINT "TokenTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParserConfig" ADD CONSTRAINT "ParserConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParserRun" ADD CONSTRAINT "ParserRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParserItem" ADD CONSTRAINT "ParserItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParserItem" ADD CONSTRAINT "ParserItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ParserRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarouselDraft" ADD CONSTRAINT "CarouselDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarouselDraft" ADD CONSTRAINT "CarouselDraft_parserItemId_fkey" FOREIGN KEY ("parserItemId") REFERENCES "ParserItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarouselDraft" ADD CONSTRAINT "CarouselDraft_coverAvatarId_fkey" FOREIGN KEY ("coverAvatarId") REFERENCES "Avatar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CryptoInvoice" ADD CONSTRAINT "CryptoInvoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchReel" ADD CONSTRAINT "ResearchReel_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "ResearchAuthor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchTranscript" ADD CONSTRAINT "ResearchTranscript_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "ResearchReel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchAnalysis" ADD CONSTRAINT "ResearchAnalysis_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "ResearchReel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchAnalysis" ADD CONSTRAINT "ResearchAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchPageAnalysis" ADD CONSTRAINT "ResearchPageAnalysis_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "ResearchAuthor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchPageAnalysis" ADD CONSTRAINT "ResearchPageAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchHook" ADD CONSTRAINT "ResearchHook_sourceReelId_fkey" FOREIGN KEY ("sourceReelId") REFERENCES "ResearchReel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchHook" ADD CONSTRAINT "ResearchHook_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchFavorite" ADD CONSTRAINT "ResearchFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchFavorite" ADD CONSTRAINT "ResearchFavorite_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "ResearchReel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchWatchlist" ADD CONSTRAINT "ResearchWatchlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchWatchlist" ADD CONSTRAINT "ResearchWatchlist_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "ResearchAuthor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchSearch" ADD CONSTRAINT "ResearchSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchFolder" ADD CONSTRAINT "ResearchFolder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchFolderItem" ADD CONSTRAINT "ResearchFolderItem_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "ResearchFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchRadar" ADD CONSTRAINT "ResearchRadar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledPost" ADD CONSTRAINT "ScheduledPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledPost" ADD CONSTRAINT "ScheduledPost_videoGenerationId_fkey" FOREIGN KEY ("videoGenerationId") REFERENCES "VideoGeneration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledPost" ADD CONSTRAINT "ScheduledPost_videoEditId_fkey" FOREIGN KEY ("videoEditId") REFERENCES "VideoEdit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostTarget" ADD CONSTRAINT "PostTarget_scheduledPostId_fkey" FOREIGN KEY ("scheduledPostId") REFERENCES "ScheduledPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostTarget" ADD CONSTRAINT "PostTarget_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

