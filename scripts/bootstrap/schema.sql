
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `admin_assinaturas_anexos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `subscriptionId` int NOT NULL,
  `fileName` varchar(500) COLLATE utf8mb4_bin NOT NULL,
  `fileKey` varchar(500) COLLATE utf8mb4_bin NOT NULL,
  `fileUrl` text COLLATE utf8mb4_bin NOT NULL,
  `fileSize` int NOT NULL,
  `mimeType` varchar(100) COLLATE utf8mb4_bin NOT NULL DEFAULT 'application/pdf',
  `uploadedById` int NOT NULL,
  `uploadedByName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `admin_assinaturas_licencas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `serviceName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `category` enum('Segurança','IA/LLM','Infraestrutura','Software','Outro') COLLATE utf8mb4_bin NOT NULL,
  `renewalType` enum('Mensal','Anual','Personalizado') COLLATE utf8mb4_bin NOT NULL,
  `renewalDays` int DEFAULT NULL,
  `startDate` bigint NOT NULL,
  `expirationDate` bigint NOT NULL,
  `value` decimal(12,2) NOT NULL,
  `currency` enum('BRL','USD') COLLATE utf8mb4_bin NOT NULL DEFAULT 'BRL',
  `status` enum('Ativo','Próximo do vencimento','Vencido','Cancelado') COLLATE utf8mb4_bin NOT NULL DEFAULT 'Ativo',
  `notes` text COLLATE utf8mb4_bin,
  `responsibleUserId` int NOT NULL,
  `responsibleUserName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `alertDaysBefore` int NOT NULL DEFAULT '30',
  `alertEnabled` tinyint(1) NOT NULL DEFAULT '1',
  `groupId` int NOT NULL,
  `createdById` int NOT NULL,
  `createdByName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chat_avaliacoes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `conversationId` int NOT NULL,
  `userId` int NOT NULL,
  `userName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `operatorId` int NOT NULL,
  `operatorName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `rating` int NOT NULL,
  `comment` text COLLATE utf8mb4_bin,
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chat_conversas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ticketId` int DEFAULT NULL,
  `title` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `type` enum('ticket_chat','direct_message','support_request') COLLATE utf8mb4_bin NOT NULL DEFAULT 'ticket_chat',
  `status` enum('active','waiting','resolved','closed') COLLATE utf8mb4_bin NOT NULL DEFAULT 'active',
  `lastMessageAt` bigint DEFAULT NULL,
  `createdById` int NOT NULL,
  `createdByName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chat_fila` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `userName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `conversationId` int DEFAULT NULL,
  `ticketId` int DEFAULT NULL,
  `position` int NOT NULL,
  `status` enum('waiting','assigned','in_progress','completed','cancelled') COLLATE utf8mb4_bin NOT NULL DEFAULT 'waiting',
  `assignedOperatorId` int DEFAULT NULL,
  `assignedOperatorName` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `initialMessage` text COLLATE utf8mb4_bin,
  `priority` enum('normal','high','urgent') COLLATE utf8mb4_bin NOT NULL DEFAULT 'normal',
  `enteredAt` bigint NOT NULL,
  `acceptedAt` bigint DEFAULT NULL,
  `completedAt` bigint DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chat_mensagens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `conversationId` int NOT NULL,
  `senderId` int NOT NULL,
  `senderName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `senderRole` enum('user','operator','admin','system') COLLATE utf8mb4_bin NOT NULL DEFAULT 'user',
  `content` text COLLATE utf8mb4_bin NOT NULL,
  `messageType` enum('text','file','image','system') COLLATE utf8mb4_bin NOT NULL DEFAULT 'text',
  `attachmentUrl` text COLLATE utf8mb4_bin,
  `attachmentName` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `isEdited` tinyint(1) NOT NULL DEFAULT '0',
  `editedAt` bigint DEFAULT NULL,
  `isDeleted` tinyint(1) NOT NULL DEFAULT '0',
  `deletedAt` bigint DEFAULT NULL,
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chat_participantes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `conversationId` int NOT NULL,
  `userId` int NOT NULL,
  `userName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `role` enum('user','operator','admin') COLLATE utf8mb4_bin NOT NULL DEFAULT 'user',
  `lastReadAt` bigint DEFAULT NULL,
  `isTyping` tinyint(1) NOT NULL DEFAULT '0',
  `typingUpdatedAt` bigint DEFAULT NULL,
  `joinedAt` bigint NOT NULL,
  `leftAt` bigint DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `comercial_catalogo` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(50) COLLATE utf8mb4_bin NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `description` text COLLATE utf8mb4_bin,
  `category` varchar(100) COLLATE utf8mb4_bin DEFAULT NULL,
  `unit` varchar(20) COLLATE utf8mb4_bin NOT NULL DEFAULT 'UN',
  `minStock` int DEFAULT '0',
  `currentStock` int DEFAULT '0',
  `status` enum('Ativo','Inativo') COLLATE utf8mb4_bin NOT NULL DEFAULT 'Ativo',
  `requiresPrescription` tinyint(1) DEFAULT '0',
  `notes` text COLLATE utf8mb4_bin,
  `createdById` int NOT NULL,
  `createdByName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `comercial_catalogo_code_unique` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `comercial_fornecedores` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `cnpj` varchar(18) COLLATE utf8mb4_bin DEFAULT NULL,
  `email` varchar(320) COLLATE utf8mb4_bin DEFAULT NULL,
  `phone` varchar(20) COLLATE utf8mb4_bin DEFAULT NULL,
  `address` text COLLATE utf8mb4_bin,
  `city` varchar(100) COLLATE utf8mb4_bin DEFAULT NULL,
  `state` varchar(2) COLLATE utf8mb4_bin DEFAULT NULL,
  `zipCode` varchar(10) COLLATE utf8mb4_bin DEFAULT NULL,
  `contactPerson` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `status` enum('Ativo','Inativo','Bloqueado') COLLATE utf8mb4_bin NOT NULL DEFAULT 'Ativo',
  `notes` text COLLATE utf8mb4_bin,
  `createdById` int NOT NULL,
  `createdByName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `comercial_fornecedores_cnpj_unique` (`cnpj`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `comercial_pde_rejeicoes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `uploadId` int NOT NULL,
  `dataRegistro` varchar(20) COLLATE utf8mb4_bin DEFAULT NULL,
  `estado` varchar(5) COLLATE utf8mb4_bin DEFAULT NULL,
  `razaoSocial` varchar(512) COLLATE utf8mb4_bin DEFAULT NULL,
  `cnpj` varchar(20) COLLATE utf8mb4_bin DEFAULT NULL,
  `pedido` varchar(32) COLLATE utf8mb4_bin DEFAULT NULL,
  `codProduto` varchar(32) COLLATE utf8mb4_bin DEFAULT NULL,
  `produto` varchar(512) COLLATE utf8mb4_bin DEFAULT NULL,
  `percentualDesconto` decimal(10,2) DEFAULT NULL,
  `precoUnitario` decimal(12,2) DEFAULT NULL,
  `qtdSolicitado` int DEFAULT NULL,
  `qtdAtendido` int DEFAULT NULL,
  `codFabricante` varchar(32) COLLATE utf8mb4_bin DEFAULT NULL,
  `fabricante` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `idPolitica` varchar(32) COLLATE utf8mb4_bin DEFAULT NULL,
  `politica` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `motivoRejeicao` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `layout` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `comercial_produtos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `uploadId` int NOT NULL,
  `codigoProduto` varchar(32) COLLATE utf8mb4_bin DEFAULT NULL,
  `produto` varchar(512) COLLATE utf8mb4_bin DEFAULT NULL,
  `codigoEan` varchar(32) COLLATE utf8mb4_bin DEFAULT NULL,
  `classificacaoFiscal` varchar(32) COLLATE utf8mb4_bin DEFAULT NULL,
  `codigoCest` varchar(32) COLLATE utf8mb4_bin DEFAULT NULL,
  `classificacaoTributaria` varchar(32) COLLATE utf8mb4_bin DEFAULT NULL,
  `descricaoClassificacao` varchar(512) COLLATE utf8mb4_bin DEFAULT NULL,
  `fabricante` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `comercial_uploads` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fileName` varchar(512) COLLATE utf8mb4_bin NOT NULL,
  `originalName` varchar(512) COLLATE utf8mb4_bin NOT NULL,
  `fileUrl` text COLLATE utf8mb4_bin,
  `fileKey` varchar(512) COLLATE utf8mb4_bin DEFAULT NULL,
  `totalRecords` int DEFAULT '0',
  `status` enum('processing','completed','error') COLLATE utf8mb4_bin NOT NULL DEFAULT 'processing',
  `errorMessage` text COLLATE utf8mb4_bin,
  `uploadedById` int NOT NULL,
  `uploadedByName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `compras_cotacoes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `quotationNumber` varchar(32) COLLATE utf8mb4_bin NOT NULL,
  `supplierId` int NOT NULL,
  `supplierName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `productId` int NOT NULL,
  `productName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `quantity` int NOT NULL,
  `unitPrice` int NOT NULL,
  `totalPrice` int NOT NULL,
  `deliveryDays` int DEFAULT NULL,
  `status` enum('Pendente','Aprovada','Rejeitada','Expirada') COLLATE utf8mb4_bin NOT NULL DEFAULT 'Pendente',
  `validUntil` bigint DEFAULT NULL,
  `notes` text COLLATE utf8mb4_bin,
  `createdById` int NOT NULL,
  `createdByName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `compras_cotacoes_quotationNumber_unique` (`quotationNumber`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `compras_pedido_itens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `purchaseOrderId` int NOT NULL,
  `productId` int NOT NULL,
  `productCode` varchar(50) COLLATE utf8mb4_bin NOT NULL,
  `productName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `quantity` int NOT NULL,
  `unitPrice` int NOT NULL,
  `totalPrice` int NOT NULL,
  `receivedQuantity` int NOT NULL DEFAULT '0',
  `notes` text COLLATE utf8mb4_bin,
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `compras_pedidos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `orderNumber` varchar(32) COLLATE utf8mb4_bin NOT NULL,
  `supplierId` int NOT NULL,
  `supplierName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `status` enum('Rascunho','Pendente','Aprovado','Enviado','Recebido Parcial','Recebido','Cancelado') COLLATE utf8mb4_bin NOT NULL DEFAULT 'Rascunho',
  `totalAmount` int NOT NULL,
  `expectedDelivery` bigint DEFAULT NULL,
  `actualDelivery` bigint DEFAULT NULL,
  `paymentTerms` varchar(100) COLLATE utf8mb4_bin DEFAULT NULL,
  `notes` text COLLATE utf8mb4_bin,
  `approvedById` int DEFAULT NULL,
  `approvedByName` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `approvedAt` bigint DEFAULT NULL,
  `createdById` int NOT NULL,
  `createdByName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `compras_pedidos_orderNumber_unique` (`orderNumber`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dev_log_atividades` (
  `id` int NOT NULL AUTO_INCREMENT,
  `action` enum('project_created','project_updated','project_deleted','project_status_changed','task_created','task_updated','task_deleted','task_status_changed','phase_created','phase_updated','phase_deleted','comment_added') COLLATE utf8mb4_bin NOT NULL,
  `userId` int NOT NULL,
  `userName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `entityType` enum('project','task','phase','comment') COLLATE utf8mb4_bin NOT NULL,
  `entityId` int NOT NULL,
  `entityName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `projectId` int DEFAULT NULL,
  `projectName` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `details` text COLLATE utf8mb4_bin,
  `oldValue` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `newValue` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `gn_comprador_marcas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `compradorId` int NOT NULL,
  `marca` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `gn_comprador_marcas_marca_unique` (`marca`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `gn_compradores` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `gn_compradores_nome_unique` (`nome`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `gn_marca_aliases` (
  `id` int NOT NULL AUTO_INCREMENT,
  `variante` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `canonica` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `gn_marca_aliases_variante_unique` (`variante`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `gn_marcas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `marca` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `gn_marcas_marca_unique` (`marca`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `indicadores_alerta_cfv_config` (
  `id` int NOT NULL AUTO_INCREMENT,
  `layouts` json NOT NULL,
  `regioes` json NOT NULL,
  `gapMinutos` int NOT NULL DEFAULT '30',
  `horaInicio` int NOT NULL DEFAULT '8',
  `horaFim` int NOT NULL DEFAULT '18',
  `diasSemana` json NOT NULL,
  `destinatarioIds` json NOT NULL,
  `destinoIds` json DEFAULT NULL,
  `waRealertaMin` int NOT NULL DEFAULT '60',
  `waAlertaEm` timestamp NULL DEFAULT NULL,
  `waUltimoAlertaEm` timestamp NULL DEFAULT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  `criadoEm` timestamp NOT NULL DEFAULT (now()),
  `atualizadoEm` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `indicadores_pedido_layout_hist` (
  `id` int NOT NULL AUTO_INCREMENT,
  `dia` varchar(10) COLLATE utf8mb4_bin NOT NULL,
  `hhmm` varchar(5) COLLATE utf8mb4_bin NOT NULL,
  `estado` varchar(8) COLLATE utf8mb4_bin NOT NULL,
  `layout` varchar(120) COLLATE utf8mb4_bin NOT NULL,
  `qtdPedidos` int NOT NULL DEFAULT '0',
  `valorPedido` double NOT NULL DEFAULT '0',
  `qtdCortados` int NOT NULL DEFAULT '0',
  `valorCortados` double NOT NULL DEFAULT '0',
  `qtdTotal` int NOT NULL DEFAULT '0',
  `capturadoEm` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ipl_hist_dia_hhmm_estado_layout_unique` (`dia`,`hhmm`,`estado`,`layout`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inventario_mapa_areas` (
  `id` varchar(36) COLLATE utf8mb4_bin NOT NULL,
  `nome` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `cor` varchar(16) COLLATE utf8mb4_bin NOT NULL,
  `posX` double NOT NULL,
  `posY` double NOT NULL,
  `width` double NOT NULL,
  `height` double NOT NULL,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inventario_mapa_equipamentos` (
  `id` varchar(36) COLLATE utf8mb4_bin NOT NULL,
  `tipo` varchar(32) COLLATE utf8mb4_bin NOT NULL DEFAULT 'Computador',
  `setorId` varchar(36) COLLATE utf8mb4_bin DEFAULT NULL,
  `posX` double NOT NULL,
  `posY` double NOT NULL,
  `nome` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `patrimonio` varchar(100) COLLATE utf8mb4_bin DEFAULT NULL,
  `mac` varchar(64) COLLATE utf8mb4_bin DEFAULT NULL,
  `sistemaOperacional` varchar(128) COLLATE utf8mb4_bin DEFAULT NULL,
  `responsavel` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `departamento` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `status` enum('Online','Offline','Alerta','Manutencao') COLLATE utf8mb4_bin NOT NULL DEFAULT 'Offline',
  `perifericos` json DEFAULT NULL,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inventario_mapa_setores` (
  `id` varchar(36) COLLATE utf8mb4_bin NOT NULL,
  `nome` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `cor` varchar(16) COLLATE utf8mb4_bin NOT NULL,
  `areaId` varchar(36) COLLATE utf8mb4_bin DEFAULT NULL,
  `posX` double NOT NULL,
  `posY` double NOT NULL,
  `width` double NOT NULL,
  `height` double NOT NULL,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `monarq_alerta_tela_config` (
  `id` int NOT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  `destinatarioIds` json DEFAULT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `monarq_backup_config` (
  `id` int NOT NULL,
  `extensoesZip` json DEFAULT NULL,
  `manterDias` int NOT NULL DEFAULT '5',
  `manterUnidade` varchar(8) COLLATE utf8mb4_bin NOT NULL DEFAULT 'uteis',
  `retencaoZipMeses` int NOT NULL DEFAULT '12',
  `caminhosExtras` json DEFAULT NULL,
  `ultimoCorte` varchar(10) COLLATE utf8mb4_bin DEFAULT NULL,
  `ultimaExecucaoEm` timestamp NULL DEFAULT NULL,
  `ultimoOk` tinyint(1) DEFAULT NULL,
  `ultimoResumo` json DEFAULT NULL,
  `ultimoErros` json DEFAULT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `monarq_coletor` (
  `id` int NOT NULL,
  `online` tinyint(1) NOT NULL DEFAULT '0',
  `ultimoHeartbeat` timestamp NULL DEFAULT NULL,
  `versao` varchar(32) COLLATE utf8mb4_bin DEFAULT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `monarq_config` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(160) COLLATE utf8mb4_bin NOT NULL,
  `caminho` varchar(512) COLLATE utf8mb4_bin NOT NULL,
  `tipoMonitoramento` varchar(16) COLLATE utf8mb4_bin NOT NULL DEFAULT 'pedidos',
  `extensoesPendente` json NOT NULL,
  `extensaoLida` varchar(32) COLLATE utf8mb4_bin NOT NULL DEFAULT '._RM',
  `intervaloVarreduraSeg` int NOT NULL DEFAULT '60',
  `slaLeituraMin` int NOT NULL DEFAULT '30',
  `gapSemPedidoMin` int NOT NULL DEFAULT '60',
  `realertaMin` int NOT NULL DEFAULT '30',
  `diasSemana` json DEFAULT NULL,
  `horaInicio` int NOT NULL DEFAULT '0',
  `horaFim` int NOT NULL DEFAULT '24',
  `waContaId` varchar(64) COLLATE utf8mb4_bin NOT NULL DEFAULT 'monitor',
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  `ultimaVarreduraEm` timestamp NULL DEFAULT NULL,
  `ultimaPastaMtime` timestamp NULL DEFAULT NULL,
  `alertaPedidoEm` timestamp NULL DEFAULT NULL,
  `alertaPedidoUltimoEm` timestamp NULL DEFAULT NULL,
  `alertaListaEm` timestamp NULL DEFAULT NULL,
  `alertaListaUltimoEm` timestamp NULL DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `monarq_config_destino` (
  `id` int NOT NULL AUTO_INCREMENT,
  `configId` int NOT NULL,
  `destinoId` int NOT NULL,
  `habilitado` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `monarq_config_destino_unique` (`configId`,`destinoId`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `monarq_destino` (
  `id` int NOT NULL AUTO_INCREMENT,
  `waContaId` varchar(64) COLLATE utf8mb4_bin NOT NULL DEFAULT 'monitor',
  `tipo` varchar(8) COLLATE utf8mb4_bin NOT NULL,
  `identificador` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `nome` varchar(160) COLLATE utf8mb4_bin NOT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  `universal` tinyint(1) NOT NULL DEFAULT '0',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `monarq_destino_conta_tipo_ident_unique` (`waContaId`,`tipo`,`identificador`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `monarq_evento` (
  `id` int NOT NULL AUTO_INCREMENT,
  `configId` int NOT NULL,
  `nomeBase` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `arquivoPendente` varchar(300) COLLATE utf8mb4_bin DEFAULT NULL,
  `extensaoPendente` varchar(32) COLLATE utf8mb4_bin DEFAULT NULL,
  `caiuEm` timestamp NOT NULL,
  `lidoEm` timestamp NULL DEFAULT NULL,
  `estado` varchar(16) COLLATE utf8mb4_bin NOT NULL DEFAULT 'pendente',
  `alertadoEm` timestamp NULL DEFAULT NULL,
  `ultimoAlertaEm` timestamp NULL DEFAULT NULL,
  `resolvidoAvisado` tinyint(1) NOT NULL DEFAULT '0',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `monarq_evento_config_base_unique` (`configId`,`nomeBase`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `monarq_historico_dia` (
  `id` int NOT NULL AUTO_INCREMENT,
  `configId` int NOT NULL,
  `dia` varchar(10) COLLATE utf8mb4_bin NOT NULL,
  `tevePedido` tinyint(1) NOT NULL DEFAULT '0',
  `qtdPedidos` int NOT NULL DEFAULT '0',
  `qtdLidos` int NOT NULL DEFAULT '0',
  `criadoEm` timestamp NOT NULL DEFAULT (now()),
  `atualizadoEm` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `monarq_historico_dia_config_dia_idx` (`configId`,`dia`)
) ENGINE=InnoDB AUTO_INCREMENT=58 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `monarq_lista` (
  `id` int NOT NULL AUTO_INCREMENT,
  `configId` int NOT NULL,
  `rotulo` varchar(120) COLLATE utf8mb4_bin NOT NULL,
  `caminho` varchar(512) COLLATE utf8mb4_bin NOT NULL,
  `modoIdentificacao` varchar(12) COLLATE utf8mb4_bin NOT NULL DEFAULT 'extensao',
  `nomeArquivo` varchar(300) COLLATE utf8mb4_bin DEFAULT NULL,
  `extensoes` json NOT NULL,
  `quantidadeEsperada` int NOT NULL DEFAULT '1',
  `horaAlvo` int NOT NULL DEFAULT '8',
  `minutoAlvo` int NOT NULL DEFAULT '0',
  `realertaMin` int NOT NULL DEFAULT '60',
  `ordem` int NOT NULL DEFAULT '0',
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  `qtdGeradaHoje` int NOT NULL DEFAULT '0',
  `deteccao` varchar(10) COLLATE utf8mb4_bin DEFAULT NULL,
  `ultimaGeracaoEm` timestamp NULL DEFAULT NULL,
  `ultimoArquivo` varchar(300) COLLATE utf8mb4_bin DEFAULT NULL,
  `ultimaVarreduraEm` timestamp NULL DEFAULT NULL,
  `diaRef` varchar(10) COLLATE utf8mb4_bin DEFAULT NULL,
  `estadoDia` varchar(16) COLLATE utf8mb4_bin NOT NULL DEFAULT 'aguardando',
  `alertadoEm` timestamp NULL DEFAULT NULL,
  `ultimoAlertaEm` timestamp NULL DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `monarq_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ts` timestamp NOT NULL DEFAULT (now()),
  `nivel` varchar(8) COLLATE utf8mb4_bin NOT NULL DEFAULT 'info',
  `msg` varchar(512) COLLATE utf8mb4_bin NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `monarq_resumo_config` (
  `id` int NOT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT '0',
  `hora` int NOT NULL DEFAULT '21',
  `minuto` int NOT NULL DEFAULT '0',
  `diasSemana` json DEFAULT NULL,
  `incluirPedidos` tinyint(1) NOT NULL DEFAULT '1',
  `incluirListas` tinyint(1) NOT NULL DEFAULT '1',
  `destinoIds` json DEFAULT NULL,
  `diaRef` varchar(10) COLLATE utf8mb4_bin DEFAULT NULL,
  `ultimoEnvioEm` timestamp NULL DEFAULT NULL,
  `ultimoOk` tinyint(1) DEFAULT NULL,
  `ultimoDetalhe` varchar(512) COLLATE utf8mb4_bin DEFAULT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `monarq_wa_conta` (
  `id` varchar(64) COLLATE utf8mb4_bin NOT NULL,
  `nome` varchar(120) COLLATE utf8mb4_bin NOT NULL,
  `status` varchar(24) COLLATE utf8mb4_bin NOT NULL DEFAULT 'aguardando_qr',
  `qrDataUrl` text COLLATE utf8mb4_bin,
  `qrTs` timestamp NULL DEFAULT NULL,
  `grupos` json DEFAULT NULL,
  `online` tinyint(1) NOT NULL DEFAULT '0',
  `ultimoHeartbeat` timestamp NULL DEFAULT NULL,
  `logoutSolicitado` tinyint(1) NOT NULL DEFAULT '0',
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `monarq_wa_outbox` (
  `id` int NOT NULL AUTO_INCREMENT,
  `waContaId` varchar(64) COLLATE utf8mb4_bin NOT NULL DEFAULT 'monitor',
  `tipo` varchar(8) COLLATE utf8mb4_bin NOT NULL,
  `identificador` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `mensagem` text COLLATE utf8mb4_bin NOT NULL,
  `eventoId` int DEFAULT NULL,
  `categoria` varchar(16) COLLATE utf8mb4_bin NOT NULL DEFAULT 'alerta',
  `status` varchar(12) COLLATE utf8mb4_bin NOT NULL DEFAULT 'pendente',
  `tentativas` int NOT NULL DEFAULT '0',
  `erro` varchar(512) COLLATE utf8mb4_bin DEFAULT NULL,
  `criadoEm` timestamp NOT NULL DEFAULT (now()),
  `enviadoEm` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `monitor_playlist_itens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `playlistId` int NOT NULL,
  `ordem` int NOT NULL,
  `panelKey` varchar(64) COLLATE utf8mb4_bin NOT NULL,
  `regionMode` enum('unificado','estados','estados_unificado') COLLATE utf8mb4_bin NOT NULL DEFAULT 'estados_unificado',
  `top` int NOT NULL DEFAULT '10',
  `dwellSeconds` int NOT NULL DEFAULT '30',
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `monitor_playlist_itens_playlist_ordem_unique` (`playlistId`,`ordem`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `monitor_playlists` (
  `id` int NOT NULL AUTO_INCREMENT,
  `slug` varchar(64) COLLATE utf8mb4_bin NOT NULL,
  `nome` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `monitor_playlists_slug_unique` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `parcial_contato_envios` (
  `id` int NOT NULL AUTO_INCREMENT,
  `contatoId` int NOT NULL,
  `envioId` int NOT NULL,
  `filtroTipo` varchar(16) COLLATE utf8mb4_bin NOT NULL DEFAULT 'todos',
  `filtroValores` json NOT NULL,
  `habilitado` tinyint(1) NOT NULL DEFAULT '1',
  `forcarEnvio` tinyint(1) NOT NULL DEFAULT '0',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `parcial_contato_envios_uk` (`contatoId`,`envioId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `parcial_contatos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tipo` varchar(16) COLLATE utf8mb4_bin NOT NULL,
  `identificador` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `nome` varchar(128) COLLATE utf8mb4_bin NOT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `parcial_contatos_tipo_ident_uk` (`tipo`,`identificador`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `parcial_envios` (
  `id` int NOT NULL AUTO_INCREMENT,
  `slug` varchar(32) COLLATE utf8mb4_bin NOT NULL,
  `nome` varchar(128) COLLATE utf8mb4_bin NOT NULL,
  `grupo` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `gerentes` json NOT NULL,
  `gerentesOcultos` json DEFAULT NULL,
  `gerentesVisiveis` json DEFAULT NULL,
  `mediaBaseTodos` tinyint(1) NOT NULL DEFAULT '1',
  `rcasOcultos` json DEFAULT NULL,
  `mediasGerenteRca` json DEFAULT NULL,
  `queryKey` varchar(32) COLLATE utf8mb4_bin NOT NULL,
  `codEstabelecimentos` json NOT NULL,
  `horaInicio` int NOT NULL DEFAULT '7',
  `horaFim` int NOT NULL DEFAULT '19',
  `horariosPadrao` json DEFAULT NULL,
  `medias` json DEFAULT NULL,
  `forcarEnvio` tinyint(1) NOT NULL DEFAULT '0',
  `pausado` tinyint(1) NOT NULL DEFAULT '0',
  `status` varchar(32) COLLATE utf8mb4_bin NOT NULL DEFAULT 'iniciando',
  `botOnline` tinyint(1) NOT NULL DEFAULT '0',
  `ultimoHeartbeat` timestamp NULL DEFAULT NULL,
  `ultimoEnvio` timestamp NULL DEFAULT NULL,
  `proximoEnvio` timestamp NULL DEFAULT NULL,
  `habilitado` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `parcial_envios_slug_unique` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `parcial_estado` (
  `id` int NOT NULL,
  `status` enum('iniciando','rodando','pausado','aguardando_qr','reconectando','erro_banco') COLLATE utf8mb4_bin NOT NULL DEFAULT 'iniciando',
  `pausado` tinyint(1) NOT NULL DEFAULT '0',
  `grupo` varchar(255) COLLATE utf8mb4_bin NOT NULL DEFAULT 'SC - NEOSUL COMERCIAL',
  `cron` varchar(64) COLLATE utf8mb4_bin NOT NULL DEFAULT '0 7-19 * * 1-5',
  `horaInicio` int NOT NULL DEFAULT '7',
  `horaFim` int NOT NULL DEFAULT '19',
  `medias` json DEFAULT NULL,
  `horariosPadrao` json DEFAULT NULL,
  `forcarEnvio` tinyint(1) NOT NULL DEFAULT '0',
  `ultimoEnvio` timestamp NULL DEFAULT NULL,
  `proximoEnvio` timestamp NULL DEFAULT NULL,
  `botOnline` tinyint(1) NOT NULL DEFAULT '0',
  `ultimoHeartbeat` timestamp NULL DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `parcial_grupos_wa` (
  `id` int NOT NULL,
  `grupos` json DEFAULT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `parcial_imagem` (
  `id` int NOT NULL,
  `mimeType` varchar(32) COLLATE utf8mb4_bin NOT NULL DEFAULT 'image/png',
  `base64` text COLLATE utf8mb4_bin,
  `geradoEm` timestamp NULL DEFAULT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `parcial_imagens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `envioId` int NOT NULL,
  `mimeType` varchar(32) COLLATE utf8mb4_bin NOT NULL DEFAULT 'image/png',
  `base64` text COLLATE utf8mb4_bin,
  `geradoEm` timestamp NULL DEFAULT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `parcial_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ts` timestamp NOT NULL DEFAULT (now()),
  `nivel` enum('ok','info','warn','erro') COLLATE utf8mb4_bin NOT NULL DEFAULT 'info',
  `msg` varchar(512) COLLATE utf8mb4_bin NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `parcial_previews` (
  `id` int NOT NULL AUTO_INCREMENT,
  `envioId` int NOT NULL,
  `sig` varchar(80) COLLATE utf8mb4_bin NOT NULL,
  `label` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `mimeType` varchar(32) COLLATE utf8mb4_bin NOT NULL DEFAULT 'image/png',
  `base64` text COLLATE utf8mb4_bin,
  `geradoEm` timestamp NULL DEFAULT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `parcial_previews_envio_sig_uk` (`envioId`,`sig`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `parcial_qr` (
  `id` int NOT NULL,
  `dataUrl` text COLLATE utf8mb4_bin,
  `ts` timestamp NULL DEFAULT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pescador_historico` (
  `id` int NOT NULL AUTO_INCREMENT,
  `estabelecimento` varchar(16) COLLATE utf8mb4_bin NOT NULL,
  `numeroNota` varchar(64) COLLATE utf8mb4_bin NOT NULL,
  `serieNota` varchar(16) COLLATE utf8mb4_bin DEFAULT NULL,
  `dataEmissao` date NOT NULL,
  `layoutOrigem` varchar(64) COLLATE utf8mb4_bin DEFAULT NULL,
  `pedidoVenda` varchar(64) COLLATE utf8mb4_bin DEFAULT NULL,
  `seqItem` int NOT NULL,
  `codInterno` varchar(32) COLLATE utf8mb4_bin NOT NULL,
  `ean` varchar(32) COLLATE utf8mb4_bin DEFAULT NULL,
  `descricao` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `fabricante` varchar(128) COLLATE utf8mb4_bin DEFAULT NULL,
  `codLote` varchar(64) COLLATE utf8mb4_bin DEFAULT NULL,
  `qtdFaturada` int DEFAULT '0',
  `precoLiquido` double DEFAULT NULL,
  `valorStUnitario` double DEFAULT NULL,
  `precoFinal` double DEFAULT NULL,
  `descontoPerc` double DEFAULT NULL,
  `valorTotalItem` double DEFAULT NULL,
  `embalagem` varchar(32) COLLATE utf8mb4_bin DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pescador_historico_unique` (`numeroNota`,`serieNota`,`seqItem`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pescador_meta` (
  `id` int NOT NULL AUTO_INCREMENT,
  `geradoEm` timestamp NOT NULL,
  `estabelecimento` varchar(32) COLLATE utf8mb4_bin NOT NULL,
  `cliente` varchar(64) COLLATE utf8mb4_bin NOT NULL,
  `janela` varchar(128) COLLATE utf8mb4_bin DEFAULT NULL,
  `totalTriagem` int NOT NULL DEFAULT '0',
  `totalPedidos` int NOT NULL DEFAULT '0',
  `totalHistorico` int NOT NULL DEFAULT '0',
  `fonte` varchar(32) COLLATE utf8mb4_bin NOT NULL DEFAULT 'seed',
  `mcEmpresa` varchar(32) COLLATE utf8mb4_bin DEFAULT NULL,
  `mcRegiaoTributaria` varchar(16) COLLATE utf8mb4_bin DEFAULT NULL,
  `mcVarFrete` double DEFAULT NULL,
  `mcVarPerdasVencidos` double DEFAULT NULL,
  `mcVarContratos` double DEFAULT NULL,
  `mcVarInvestEmp` double DEFAULT NULL,
  `mcVarAssociativismo` double DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pescador_pedidos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `dataPedido` date DEFAULT NULL,
  `numeroPedidoVenda` varchar(64) COLLATE utf8mb4_bin NOT NULL,
  `codigoPedidoCliente` varchar(64) COLLATE utf8mb4_bin DEFAULT NULL,
  `cnpjCliente` varchar(32) COLLATE utf8mb4_bin DEFAULT NULL,
  `numeroDesdobramento` int DEFAULT NULL,
  `valorTotalPedido` double DEFAULT NULL,
  `motivoRejeicaoPedido` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pescador_pedidos_unique` (`cnpjCliente`,`codigoPedidoCliente`,`numeroDesdobramento`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pescador_pedidos_itens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pedidoId` int NOT NULL,
  `codInterno` varchar(32) COLLATE utf8mb4_bin NOT NULL,
  `ean` varchar(32) COLLATE utf8mb4_bin DEFAULT NULL,
  `descricao` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `fabricante` varchar(128) COLLATE utf8mb4_bin DEFAULT NULL,
  `politica` varchar(96) COLLATE utf8mb4_bin DEFAULT NULL,
  `qtdSolicitada` int DEFAULT '0',
  `qtdAtendida` int DEFAULT '0',
  `statusAtendimento` varchar(32) COLLATE utf8mb4_bin DEFAULT NULL,
  `motivoRejeicaoItem` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `precoUnitarioPedido` double DEFAULT NULL,
  `descontoPedidoPerc` double DEFAULT NULL,
  `valorTotalItemPedido` double DEFAULT NULL,
  `numeroNota` varchar(64) COLLATE utf8mb4_bin DEFAULT NULL,
  `dataNota` date DEFAULT NULL,
  `qtdFaturada` int DEFAULT '0',
  `precoPraticadoNota` double DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pescador_triagem` (
  `id` int NOT NULL AUTO_INCREMENT,
  `estabelecimento` varchar(16) COLLATE utf8mb4_bin NOT NULL,
  `ean` varchar(32) COLLATE utf8mb4_bin NOT NULL,
  `codInterno` varchar(32) COLLATE utf8mb4_bin NOT NULL,
  `descricao` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `fabricante` varchar(128) COLLATE utf8mb4_bin DEFAULT NULL,
  `fornecedor` varchar(128) COLLATE utf8mb4_bin DEFAULT NULL,
  `politica` varchar(96) COLLATE utf8mb4_bin NOT NULL,
  `estoqueSc` int NOT NULL DEFAULT '0',
  `custoCom` double DEFAULT NULL,
  `custoGer` double DEFAULT NULL,
  `curvaAbc` varchar(8) COLLATE utf8mb4_bin DEFAULT NULL,
  `precoTabela` double DEFAULT NULL,
  `precoPromocional` double DEFAULT NULL,
  `descontoPerc` double DEFAULT NULL,
  `precoUnitario` double DEFAULT NULL,
  `margem` double DEFAULT NULL,
  `precoPraticado` double DEFAULT NULL,
  `markup` double DEFAULT NULL,
  `valorUltimaCompraIpi` double DEFAULT NULL,
  `mc` double DEFAULT NULL,
  `percMc` double DEFAULT NULL,
  `giroEstoque` double DEFAULT NULL,
  `vlrCustoMedio` double DEFAULT NULL,
  `percIcms` double DEFAULT NULL,
  `percPis` double DEFAULT NULL,
  `percCofins` double DEFAULT NULL,
  `percComissao` double DEFAULT NULL,
  `percFrete` double DEFAULT NULL,
  `percInvestEmp` double DEFAULT NULL,
  `percAssociativismo` double DEFAULT NULL,
  `percPerdasVencidos` double DEFAULT NULL,
  `percContratos` double DEFAULT NULL,
  `percRepasse` double DEFAULT NULL,
  `origemPreco` varchar(32) COLLATE utf8mb4_bin DEFAULT NULL,
  `giroMes` double DEFAULT NULL,
  `qtdVendidaMes` int DEFAULT '0',
  `qtdVendidaMesAnterior` int DEFAULT '0',
  `acompanhamento` varchar(32) COLLATE utf8mb4_bin DEFAULT NULL,
  `dataD1` date DEFAULT NULL,
  `vendaD1` int DEFAULT '0',
  `dataD2` date DEFAULT NULL,
  `vendaD2` int DEFAULT '0',
  `dataD3` date DEFAULT NULL,
  `vendaD3` int DEFAULT '0',
  `dataD4` date DEFAULT NULL,
  `vendaD4` int DEFAULT '0',
  `dataD5` date DEFAULT NULL,
  `vendaD5` int DEFAULT '0',
  `dataD6` date DEFAULT NULL,
  `vendaD6` int DEFAULT '0',
  `dataD7` date DEFAULT NULL,
  `vendaD7` int DEFAULT '0',
  `dataD8` date DEFAULT NULL,
  `vendaD8` int DEFAULT '0',
  `dataD9` date DEFAULT NULL,
  `vendaD9` int DEFAULT '0',
  `dataD10` date DEFAULT NULL,
  `vendaD10` int DEFAULT '0',
  `dataD11` date DEFAULT NULL,
  `vendaD11` int DEFAULT '0',
  `dataD12` date DEFAULT NULL,
  `vendaD12` int DEFAULT '0',
  `dataD13` date DEFAULT NULL,
  `vendaD13` int DEFAULT '0',
  `dataD14` date DEFAULT NULL,
  `vendaD14` int DEFAULT '0',
  `dataD15` date DEFAULT NULL,
  `vendaD15` int DEFAULT '0',
  `codLote` varchar(64) COLLATE utf8mb4_bin DEFAULT NULL,
  `loteEstoque` int DEFAULT '0',
  `loteVencimento` date DEFAULT NULL,
  `statusValidadeLote` varchar(32) COLLATE utf8mb4_bin DEFAULT NULL,
  `embalagem` varchar(32) COLLATE utf8mb4_bin DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pescador_triagem_ean_politica_unique` (`ean`,`politica`)
) ENGINE=InnoDB AUTO_INCREMENT=44 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `projetos_anexos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `projectId` int NOT NULL,
  `fileName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `fileUrl` text COLLATE utf8mb4_bin NOT NULL,
  `fileKey` varchar(512) COLLATE utf8mb4_bin NOT NULL,
  `mimeType` varchar(128) COLLATE utf8mb4_bin DEFAULT NULL,
  `fileSize` int DEFAULT NULL,
  `category` enum('imagem','planilha','documento','outro') COLLATE utf8mb4_bin NOT NULL DEFAULT 'outro',
  `description` text COLLATE utf8mb4_bin,
  `uploadedById` int NOT NULL,
  `uploadedByName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `projetos_base` (
  `id` int NOT NULL AUTO_INCREMENT,
  `projectId` varchar(32) COLLATE utf8mb4_bin NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `description` text COLLATE utf8mb4_bin,
  `status` enum('Planejamento','Em Andamento','Em Pausa','Concluído','Cancelado') COLLATE utf8mb4_bin NOT NULL DEFAULT 'Planejamento',
  `priority` enum('Baixa','Média','Alta','Crítica') COLLATE utf8mb4_bin NOT NULL DEFAULT 'Média',
  `ownerId` int NOT NULL,
  `ownerName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `sector` enum('TI','RH','Financeiro','Comercial','Suporte','Operações') COLLATE utf8mb4_bin NOT NULL DEFAULT 'TI',
  `projectType` enum('Integração Interna','Integração Externa') COLLATE utf8mb4_bin NOT NULL DEFAULT 'Integração Interna',
  `startDate` bigint DEFAULT NULL,
  `endDate` bigint DEFAULT NULL,
  `progress` int NOT NULL DEFAULT '0',
  `createdById` int NOT NULL,
  `createdByName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `updatedById` int DEFAULT NULL,
  `updatedByName` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  `kanbanOrder` int DEFAULT NULL,
  `isBeingTreated` tinyint(1) NOT NULL DEFAULT '0',
  `treatedByName` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `treatedAt` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `projetos_base_projectId_unique` (`projectId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `projetos_comentarios` (
  `id` int NOT NULL AUTO_INCREMENT,
  `projectId` int NOT NULL,
  `authorId` int NOT NULL,
  `authorName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `content` text COLLATE utf8mb4_bin NOT NULL,
  `mentions` text COLLATE utf8mb4_bin,
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `projetos_fases` (
  `id` int NOT NULL AUTO_INCREMENT,
  `projectId` int NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `description` text COLLATE utf8mb4_bin,
  `status` enum('Pendente','Em Andamento','Concluída','Atrasada') COLLATE utf8mb4_bin NOT NULL DEFAULT 'Pendente',
  `order` int NOT NULL,
  `startDate` bigint DEFAULT NULL,
  `endDate` bigint DEFAULT NULL,
  `completedAt` bigint DEFAULT NULL,
  `createdById` int DEFAULT NULL,
  `createdByName` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `updatedById` int DEFAULT NULL,
  `updatedByName` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `projetos_historico` (
  `id` int NOT NULL AUTO_INCREMENT,
  `projectId` int NOT NULL,
  `entityType` enum('project','phase','daily_task','comment') COLLATE utf8mb4_bin NOT NULL,
  `entityId` int NOT NULL,
  `actionType` enum('created','updated','deleted','status_changed','progress_changed','priority_changed','assigned','completed','comment_added') COLLATE utf8mb4_bin NOT NULL,
  `description` text COLLATE utf8mb4_bin NOT NULL,
  `oldValues` json DEFAULT NULL,
  `newValues` json DEFAULT NULL,
  `fieldChanged` varchar(100) COLLATE utf8mb4_bin DEFAULT NULL,
  `userId` int NOT NULL,
  `userName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `repasses_contratos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `codigo` varchar(32) COLLATE utf8mb4_bin DEFAULT NULL,
  `apelidoInterno` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `parceiro` varchar(512) COLLATE utf8mb4_bin NOT NULL,
  `cnpj` varchar(32) COLLATE utf8mb4_bin NOT NULL,
  `estado` enum('SC','RS') COLLATE utf8mb4_bin NOT NULL,
  `grupo` enum('Associativismo','Farmácias') COLLATE utf8mb4_bin NOT NULL,
  `status` enum('Vigente','Vencido') COLLATE utf8mb4_bin NOT NULL DEFAULT 'Vigente',
  `gatilhoMensal` decimal(14,2) NOT NULL,
  `vigenciaInicio` date NOT NULL,
  `vigenciaFim` date NOT NULL,
  `observacoes` text COLLATE utf8mb4_bin,
  `pdfFileName` varchar(512) COLLATE utf8mb4_bin DEFAULT NULL,
  `pdfFileKey` varchar(512) COLLATE utf8mb4_bin DEFAULT NULL,
  `pdfFileUrl` text COLLATE utf8mb4_bin,
  `createdById` int DEFAULT NULL,
  `createdByName` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `updatedById` int DEFAULT NULL,
  `updatedByName` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `repasses_filiais` (
  `id` int NOT NULL AUTO_INCREMENT,
  `contratoId` int NOT NULL,
  `nome` varchar(512) COLLATE utf8mb4_bin NOT NULL,
  `ordem` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `repasses_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `contratoId` int NOT NULL,
  `acao` enum('criacao','atualizacao','edicao') COLLATE utf8mb4_bin NOT NULL,
  `motivo` text COLLATE utf8mb4_bin,
  `dadosAnteriores` json DEFAULT NULL,
  `userId` int DEFAULT NULL,
  `userName` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `repasses_taxas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `contratoId` int NOT NULL,
  `categoria` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `percentual` decimal(6,2) NOT NULL,
  `ordem` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `responsabilidades_historico` (
  `id` int NOT NULL AUTO_INCREMENT,
  `changeType` enum('created','updated','deleted','assigned','unassigned') COLLATE utf8mb4_bin NOT NULL,
  `entityType` enum('tag','person_responsibility','ticket_responsibility','task_responsibility') COLLATE utf8mb4_bin NOT NULL,
  `entityId` int NOT NULL,
  `changedById` int NOT NULL,
  `changedByName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `oldValues` json DEFAULT NULL,
  `newValues` json DEFAULT NULL,
  `description` text COLLATE utf8mb4_bin,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `responsabilidades_pessoas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `tagId` int NOT NULL,
  `level` enum('junior','pleno','senior','especialista') COLLATE utf8mb4_bin NOT NULL DEFAULT 'pleno',
  `isPrimary` tinyint(1) NOT NULL DEFAULT '0',
  `notes` text COLLATE utf8mb4_bin,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `responsabilidades_tags` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_bin NOT NULL,
  `description` text COLLATE utf8mb4_bin,
  `color` varchar(7) COLLATE utf8mb4_bin NOT NULL DEFAULT '#3b82f6',
  `icon` varchar(50) COLLATE utf8mb4_bin DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `responsabilidades_tags_name_unique` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rupturas_compradores` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fornecedor` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `comprador` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `rupturas_compradores_fornecedor_unique` (`fornecedor`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rupturas_marca_resumo` (
  `id` int NOT NULL AUTO_INCREMENT,
  `region` enum('SC','RS') COLLATE utf8mb4_bin NOT NULL,
  `fornecedor` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `totalAtivos` int NOT NULL DEFAULT '0',
  `qtdRuptura` int NOT NULL DEFAULT '0',
  `qtdZerados` int NOT NULL DEFAULT '0',
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `rupturas_marca_resumo_region_fornecedor_unique` (`region`,`fornecedor`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rupturas_produtos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `codigo` int NOT NULL,
  `region` enum('SC','RS') COLLATE utf8mb4_bin NOT NULL,
  `fornecedor` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `nomeProduto` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `tipoProduto` enum('medicamento','nao_medicamento') COLLATE utf8mb4_bin NOT NULL DEFAULT 'medicamento',
  `diasEstoque` double NOT NULL DEFAULT '0',
  `estoqueAtual` int NOT NULL DEFAULT '0',
  `vendaMedia` double NOT NULL DEFAULT '0',
  `valorCusto` double DEFAULT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `rupturas_produtos_codigo_region_unique` (`codigo`,`region`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `superestocados_campanha_historico` (
  `id` int NOT NULL AUTO_INCREMENT,
  `superestoqueId` int NOT NULL,
  `descricao` text COLLATE utf8mb4_bin NOT NULL,
  `dataInicio` date DEFAULT NULL,
  `dataFim` date DEFAULT NULL,
  `criadoEm` timestamp NOT NULL DEFAULT (now()),
  `finalizadoEm` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `superestocados_chat_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `superestoqueRegion` enum('SC','RS') COLLATE utf8mb4_bin NOT NULL,
  `messages` json NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `superestocados_historico_vendas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `superestoqueId` int NOT NULL,
  `dataVenda` date NOT NULL,
  `quantidade` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `historico_vendas_superestoque_data_unique` (`superestoqueId`,`dataVenda`)
) ENGINE=InnoDB AUTO_INCREMENT=421 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `superestocados_lotes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `superestoqueId` int NOT NULL,
  `codLote` varchar(64) COLLATE utf8mb4_bin NOT NULL,
  `vencimentoLote` date DEFAULT NULL,
  `estoqueLote` int NOT NULL DEFAULT '0',
  `qtdVendida` int NOT NULL DEFAULT '0',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `lote_superestoque_unique` (`superestoqueId`,`codLote`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `superestocados_permanencia` (
  `id` int NOT NULL AUTO_INCREMENT,
  `codigo` int NOT NULL,
  `region` varchar(8) COLLATE utf8mb4_bin NOT NULL,
  `tipoProduto` varchar(32) COLLATE utf8mb4_bin NOT NULL,
  `entrouEm` timestamp NOT NULL,
  `saiuEm` timestamp NULL DEFAULT NULL,
  `diasPermanencia` int DEFAULT NULL,
  `transfRecebida` int NOT NULL DEFAULT '0',
  `transfEnviada` int NOT NULL DEFAULT '0',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `superestocados_produtos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `codigo` int NOT NULL,
  `superestoqueRegion` enum('SC','RS') COLLATE utf8mb4_bin NOT NULL,
  `tipoProduto` enum('medicamento','nao_medicamento') COLLATE utf8mb4_bin NOT NULL DEFAULT 'medicamento',
  `nomeProduto` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `fornecedor` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `ultimaCompra` double DEFAULT NULL,
  `dataUltimaCompra` varchar(32) COLLATE utf8mb4_bin DEFAULT NULL,
  `diasEstoque` int NOT NULL DEFAULT '0',
  `estoqueInicial` int NOT NULL,
  `estoqueAtual` int NOT NULL,
  `painelEntradaEm` timestamp NULL DEFAULT NULL,
  `diasEstoqueEntrada` int DEFAULT NULL,
  `excessoEntradaReais` double DEFAULT NULL,
  `transfRecebidaAcum` int NOT NULL DEFAULT '0',
  `transfEnviadaAcum` int NOT NULL DEFAULT '0',
  `transfProcessadaAte` date DEFAULT NULL,
  `valorCusto` double DEFAULT NULL,
  `vendaMedia` double NOT NULL DEFAULT '0',
  `dataCadastroProduto` varchar(32) COLLATE utf8mb4_bin DEFAULT NULL,
  `statusCampanha` enum('nao_participa','em_campanha') COLLATE utf8mb4_bin NOT NULL DEFAULT 'nao_participa',
  `estoqueIdealCongelado` int DEFAULT NULL,
  `campanhaDescricao` text COLLATE utf8mb4_bin,
  `campanhaInicio` date DEFAULT NULL,
  `campanhaFim` date DEFAULT NULL,
  `campanhaObservacao` text COLLATE utf8mb4_bin,
  `vendaZeradaEntradaEm` timestamp NULL DEFAULT NULL,
  `vendaZeradaEstoqueInicial` int DEFAULT NULL,
  `dataUltimaTransferencia` varchar(32) COLLATE utf8mb4_bin DEFAULT NULL,
  `qtdVendaMesAnterior` int DEFAULT '0',
  `qtdVenda2MesesAnterior` int DEFAULT '0',
  `qtdProjetadoMesAtual` int DEFAULT '0',
  `precoPolitica` double DEFAULT NULL,
  `qtdVendaMesAtual` int DEFAULT '0',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `superestoque_codigo_region_unique` (`codigo`,`superestoqueRegion`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `superestocados_resumo_semanal` (
  `id` int NOT NULL AUTO_INCREMENT,
  `region` enum('SC','RS') COLLATE utf8mb4_bin NOT NULL,
  `anoSemana` varchar(8) COLLATE utf8mb4_bin NOT NULL,
  `valorEstoqueTotal` double NOT NULL DEFAULT '0',
  `qtdProdutos` int NOT NULL DEFAULT '0',
  `valorMedicamento` double DEFAULT NULL,
  `valorMedicamentoZerado` double DEFAULT NULL,
  `valorNaoMedicamento` double DEFAULT NULL,
  `valorNaoMedicamentoZerado` double DEFAULT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `superestocados_resumo_semanal_region_semana_unique` (`region`,`anoSemana`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `suporte_anexos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ticketId` int NOT NULL,
  `fileName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `fileUrl` text COLLATE utf8mb4_bin NOT NULL,
  `fileKey` varchar(512) COLLATE utf8mb4_bin NOT NULL,
  `mimeType` varchar(128) COLLATE utf8mb4_bin DEFAULT NULL,
  `fileSize` int DEFAULT NULL,
  `uploadedById` int NOT NULL,
  `uploadedByName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `suporte_atividades` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ticketId` int NOT NULL,
  `type` enum('status_change','priority_change','assignment','comment','created','sector_change') COLLATE utf8mb4_bin NOT NULL,
  `authorId` int NOT NULL,
  `authorName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `oldValue` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `newValue` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `description` text COLLATE utf8mb4_bin,
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `suporte_avaliacoes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ticketId` int NOT NULL,
  `ticketDisplayId` varchar(32) COLLATE utf8mb4_bin NOT NULL,
  `ticketTitle` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `ticketCategory` varchar(100) COLLATE utf8mb4_bin NOT NULL,
  `assignedToId` int DEFAULT NULL,
  `assignedToName` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `rating` int NOT NULL,
  `observation` text COLLATE utf8mb4_bin,
  `evaluatorSectorId` int DEFAULT NULL,
  `evaluatorSectorName` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `evaluatorUserId` int NOT NULL,
  `evaluatedAt` bigint NOT NULL,
  `resolutionTimeMinutes` int DEFAULT NULL,
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `suporte_avaliacoes_ticketId_unique` (`ticketId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `suporte_chamados` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ticketId` varchar(32) COLLATE utf8mb4_bin NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `description` text COLLATE utf8mb4_bin NOT NULL,
  `category` enum('Técnico','Acesso','Funcionalidade','Dúvida','Outro') COLLATE utf8mb4_bin NOT NULL DEFAULT 'Técnico',
  `priority` enum('Baixa','Média','Alta','Crítica') COLLATE utf8mb4_bin NOT NULL DEFAULT 'Média',
  `status` enum('Novos','Em Andamento','Pendente Cliente','Em Análise','Pendente ERP','Resolvido / Aguardando Validação','Concluído') COLLATE utf8mb4_bin NOT NULL DEFAULT 'Novos',
  `departmentId` int DEFAULT NULL,
  `createdById` int NOT NULL,
  `createdByName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `assignedToId` int DEFAULT NULL,
  `assignedToName` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `waitingForDepartment` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `lastRespondentRole` enum('admin','user') COLLATE utf8mb4_bin DEFAULT NULL,
  `lastRespondentId` int DEFAULT NULL,
  `lastRespondentName` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `order` int NOT NULL DEFAULT '0',
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `suporte_chamados_ticketId_unique` (`ticketId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `suporte_comentarios` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ticketId` int NOT NULL,
  `authorId` int NOT NULL,
  `authorName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `content` text COLLATE utf8mb4_bin NOT NULL,
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `suporte_disponibilidade_operador` (
  `id` int NOT NULL AUTO_INCREMENT,
  `operatorId` int NOT NULL,
  `operatorName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `isAvailableForChat` tinyint(1) NOT NULL DEFAULT '0',
  `status` enum('available','busy','away','offline') COLLATE utf8mb4_bin NOT NULL DEFAULT 'offline',
  `maxConcurrentChats` int NOT NULL DEFAULT '3',
  `currentActiveChats` int NOT NULL DEFAULT '0',
  `lastActiveAt` bigint DEFAULT NULL,
  `statusMessage` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `updatedAt` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `suporte_disponibilidade_operador_operatorId_unique` (`operatorId`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `suporte_kanban_colunas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `module` varchar(50) COLLATE utf8mb4_bin NOT NULL,
  `columnKey` varchar(50) COLLATE utf8mb4_bin NOT NULL,
  `customName` varchar(100) COLLATE utf8mb4_bin NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `suporte_responsaveis` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ticketId` int NOT NULL,
  `userId` int NOT NULL,
  `role` enum('primary','secondary','reviewer') COLLATE utf8mb4_bin NOT NULL DEFAULT 'primary',
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  `estimatedHours` int DEFAULT NULL,
  `actualHours` int DEFAULT NULL,
  `notes` text COLLATE utf8mb4_bin,
  `assignedAt` timestamp NOT NULL DEFAULT (now()),
  `completedAt` timestamp NULL DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_backups` (
  `id` int NOT NULL AUTO_INCREMENT,
  `filename` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `fileSize` bigint NOT NULL,
  `checksum` varchar(64) COLLATE utf8mb4_bin NOT NULL,
  `status` enum('completed','failed','in_progress') COLLATE utf8mb4_bin NOT NULL DEFAULT 'in_progress',
  `s3Key` varchar(512) COLLATE utf8mb4_bin NOT NULL,
  `s3Url` varchar(1024) COLLATE utf8mb4_bin NOT NULL,
  `tablesBackedUp` json DEFAULT NULL,
  `recordCount` int NOT NULL DEFAULT '0',
  `createdAt` bigint NOT NULL,
  `createdBy` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_comunicados` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `content` text COLLATE utf8mb4_bin,
  `type` enum('info','warning','success','error') COLLATE utf8mb4_bin NOT NULL DEFAULT 'info',
  `isActive` int NOT NULL DEFAULT '1',
  `createdById` int NOT NULL,
  `createdAt` bigint NOT NULL,
  `expiresAt` bigint DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_departamentos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `description` text COLLATE utf8mb4_bin,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sys_departamentos_name_unique` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_estatisticas_usuario` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `totalPoints` int NOT NULL DEFAULT '0',
  `tasksCompleted` int NOT NULL DEFAULT '0',
  `currentStreak` int NOT NULL DEFAULT '0',
  `longestStreak` int NOT NULL DEFAULT '0',
  `lastActiveDate` date DEFAULT NULL,
  `level` int NOT NULL DEFAULT '1',
  `badges` json DEFAULT NULL,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sys_estatisticas_usuario_userId_unique` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_grupos_permissao` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_bin NOT NULL,
  `description` text COLLATE utf8mb4_bin,
  `permissions` json NOT NULL,
  `isDefault` tinyint(1) NOT NULL DEFAULT '0',
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sys_grupos_permissao_name_unique` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_notificacoes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `type` enum('stock_critical','stock_low','request_created','request_updated','request_completed','task_assigned','task_due_soon','ticket_created','ticket_updated','ticket_comment','ticket_assigned','ticket_status_changed','mention','system') COLLATE utf8mb4_bin NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `message` text COLLATE utf8mb4_bin NOT NULL,
  `referenceId` int DEFAULT NULL,
  `referenceType` varchar(50) COLLATE utf8mb4_bin DEFAULT NULL,
  `actionUrl` varchar(512) COLLATE utf8mb4_bin DEFAULT NULL,
  `isRead` tinyint(1) NOT NULL DEFAULT '0',
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_parametros` (
  `id` int NOT NULL AUTO_INCREMENT,
  `chave` varchar(100) COLLATE utf8mb4_bin NOT NULL,
  `valor` varchar(500) COLLATE utf8mb4_bin NOT NULL,
  `tipo` enum('number','boolean','string') COLLATE utf8mb4_bin NOT NULL DEFAULT 'string',
  `modulo` varchar(100) COLLATE utf8mb4_bin NOT NULL DEFAULT 'geral',
  `descricao` text COLLATE utf8mb4_bin,
  `updatedBy` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `sys_parametros_chave_unique` (`chave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_status_online` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `userName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `userRole` enum('user','admin') COLLATE utf8mb4_bin NOT NULL DEFAULT 'user',
  `isOnline` tinyint(1) NOT NULL DEFAULT '0',
  `lastActivityAt` bigint NOT NULL,
  `currentPage` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `statusMessage` varchar(100) COLLATE utf8mb4_bin DEFAULT 'Disponível',
  PRIMARY KEY (`id`),
  UNIQUE KEY `sys_status_online_userId_unique` (`userId`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_usuarios` (
  `id` int NOT NULL AUTO_INCREMENT,
  `openId` varchar(64) COLLATE utf8mb4_bin DEFAULT NULL,
  `name` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `email` varchar(320) COLLATE utf8mb4_bin NOT NULL,
  `passwordHash` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `loginMethod` enum('internal','oauth') COLLATE utf8mb4_bin NOT NULL DEFAULT 'internal',
  `role` enum('user','admin') COLLATE utf8mb4_bin NOT NULL DEFAULT 'user',
  `approvalStatus` enum('pending','approved','rejected') COLLATE utf8mb4_bin NOT NULL DEFAULT 'pending',
  `departmentId` int DEFAULT NULL,
  `groupId` int DEFAULT NULL,
  `permissions` json DEFAULT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `lastSignedIn` timestamp NULL DEFAULT NULL,
  `avatarUrl` text COLLATE utf8mb4_bin,
  `whatsapp` varchar(20) COLLATE utf8mb4_bin DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sys_usuarios_email_unique` (`email`),
  UNIQUE KEY `sys_usuarios_openId_unique` (`openId`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `system_error_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `module` varchar(100) COLLATE utf8mb4_bin NOT NULL,
  `operation` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `errorMessage` text COLLATE utf8mb4_bin NOT NULL,
  `stackTrace` text COLLATE utf8mb4_bin,
  `context` json DEFAULT NULL,
  `severity` enum('error','warning','info') COLLATE utf8mb4_bin NOT NULL DEFAULT 'error',
  `resolved` tinyint NOT NULL DEFAULT '0',
  `resolutionNotes` text COLLATE utf8mb4_bin,
  `userId` int DEFAULT NULL,
  `userName` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `createdAt` bigint NOT NULL,
  `resolvedAt` bigint DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tarefas_comentarios` (
  `id` int NOT NULL AUTO_INCREMENT,
  `taskId` int NOT NULL,
  `authorId` int NOT NULL,
  `authorName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `content` text COLLATE utf8mb4_bin NOT NULL,
  `mentions` json DEFAULT NULL,
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tarefas_compras` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `description` text COLLATE utf8mb4_bin,
  `status` enum('todo','quoting','awaiting_approval','ordered','received','completed') COLLATE utf8mb4_bin NOT NULL DEFAULT 'todo',
  `priority` enum('low','medium','high','urgent') COLLATE utf8mb4_bin NOT NULL DEFAULT 'medium',
  `assignedToId` int DEFAULT NULL,
  `tags` text COLLATE utf8mb4_bin,
  `dueDate` date DEFAULT NULL,
  `position` int NOT NULL DEFAULT '0',
  `createdById` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tarefas_diarias` (
  `id` int NOT NULL AUTO_INCREMENT,
  `projectId` int NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `description` text COLLATE utf8mb4_bin,
  `status` enum('Pendente','Em Andamento','Concluída') COLLATE utf8mb4_bin NOT NULL DEFAULT 'Pendente',
  `priority` enum('Baixa','Média','Alta','Crítica') COLLATE utf8mb4_bin NOT NULL DEFAULT 'Média',
  `assignedToId` int DEFAULT NULL,
  `assignedToName` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `dueDate` bigint DEFAULT NULL,
  `completedAt` bigint DEFAULT NULL,
  `createdById` int NOT NULL,
  `createdByName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `points` int NOT NULL DEFAULT '0',
  `difficulty` enum('Facil','Normal','Dificil','Muito Dificil') COLLATE utf8mb4_bin NOT NULL DEFAULT 'Normal',
  `assignedToIds` json DEFAULT NULL,
  `tags` json DEFAULT NULL,
  `isRecurring` tinyint(1) NOT NULL DEFAULT '0',
  `recurrencePattern` varchar(50) COLLATE utf8mb4_bin DEFAULT NULL,
  `templateId` int DEFAULT NULL,
  `order` int NOT NULL DEFAULT '0',
  `updatedById` int DEFAULT NULL,
  `updatedByName` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tarefas_gestao` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `description` text COLLATE utf8mb4_bin,
  `type` enum('daily','weekly','monthly') COLLATE utf8mb4_bin NOT NULL,
  `status` enum('pending','in_progress','completed') COLLATE utf8mb4_bin NOT NULL DEFAULT 'pending',
  `priority` enum('Baixa','Média','Alta','Crítica') COLLATE utf8mb4_bin NOT NULL DEFAULT 'Média',
  `difficulty` enum('Facil','Normal','Dificil','Muito Dificil') COLLATE utf8mb4_bin NOT NULL DEFAULT 'Normal',
  `points` int NOT NULL DEFAULT '10',
  `assignedToId` int DEFAULT NULL,
  `assignedToName` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `dueDate` bigint DEFAULT NULL,
  `completedDate` bigint DEFAULT NULL,
  `recurrencePattern` varchar(50) COLLATE utf8mb4_bin DEFAULT NULL,
  `tags` json DEFAULT NULL,
  `createdById` int NOT NULL,
  `createdByName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tarefas_gestao_comentarios` (
  `id` int NOT NULL AUTO_INCREMENT,
  `taskId` int NOT NULL,
  `userId` int NOT NULL,
  `userName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `content` text COLLATE utf8mb4_bin NOT NULL,
  `mentionedUserIds` json DEFAULT NULL,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tarefas_modelos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `description` text COLLATE utf8mb4_bin,
  `defaultPriority` enum('Baixa','Média','Alta','Crítica') COLLATE utf8mb4_bin NOT NULL DEFAULT 'Média',
  `defaultDifficulty` enum('Facil','Normal','Dificil','Muito Dificil') COLLATE utf8mb4_bin NOT NULL DEFAULT 'Normal',
  `defaultPoints` int NOT NULL DEFAULT '10',
  `defaultTags` json DEFAULT NULL,
  `isRecurring` tinyint(1) NOT NULL DEFAULT '0',
  `recurrencePattern` varchar(50) COLLATE utf8mb4_bin DEFAULT NULL,
  `createdById` int NOT NULL,
  `createdByName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tarefas_responsaveis` (
  `id` int NOT NULL AUTO_INCREMENT,
  `taskId` int NOT NULL,
  `userId` int NOT NULL,
  `role` enum('owner','collaborator') COLLATE utf8mb4_bin NOT NULL DEFAULT 'owner',
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  `estimatedHours` int DEFAULT NULL,
  `actualHours` int DEFAULT NULL,
  `notes` text COLLATE utf8mb4_bin,
  `assignedAt` timestamp NOT NULL DEFAULT (now()),
  `completedAt` timestamp NULL DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ti_inventario_baixas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `writeOffId` varchar(32) COLLATE utf8mb4_bin NOT NULL,
  `itemId` int NOT NULL,
  `itemName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `serialNumber` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `reason` enum('Defeito','Obsoleto','Perda','Roubo','Doação','Venda','Outro') COLLATE utf8mb4_bin NOT NULL,
  `reasonDescription` text COLLATE utf8mb4_bin,
  `writeOffDate` bigint NOT NULL,
  `estimatedValue` decimal(10,2) DEFAULT NULL,
  `authorizedById` int NOT NULL,
  `authorizedByName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `createdById` int NOT NULL,
  `createdByName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ti_inventario_baixas_writeOffId_unique` (`writeOffId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ti_inventario_categorias` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `description` text COLLATE utf8mb4_bin,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ti_inventario_categorias_name_unique` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ti_inventario_itens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `itemId` varchar(32) COLLATE utf8mb4_bin NOT NULL,
  `tag` varchar(100) COLLATE utf8mb4_bin NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `description` text COLLATE utf8mb4_bin,
  `categoryId` int NOT NULL,
  `categoryName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `sector` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `responsible` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `serialNumber` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `model` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `manufacturer` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `purchaseDate` bigint DEFAULT NULL,
  `purchasePrice` decimal(10,2) DEFAULT NULL,
  `warrantyExpiration` bigint DEFAULT NULL,
  `status` enum('Disponível','Em Uso','Manutenção','Descartado','Emprestado') COLLATE utf8mb4_bin NOT NULL DEFAULT 'Disponível',
  `location` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `assignedToId` int DEFAULT NULL,
  `assignedToName` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `assignedDate` bigint DEFAULT NULL,
  `notes` text COLLATE utf8mb4_bin,
  `createdById` int NOT NULL,
  `createdByName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ti_inventario_itens_itemId_unique` (`itemId`),
  UNIQUE KEY `ti_inventario_itens_tag_unique` (`tag`),
  UNIQUE KEY `tag_unique_idx` (`tag`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ti_inventario_manutencao` (
  `id` int NOT NULL AUTO_INCREMENT,
  `maintenanceId` varchar(32) COLLATE utf8mb4_bin NOT NULL,
  `itemId` int NOT NULL,
  `itemName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `type` enum('Preventiva','Corretiva','Limpeza','Inspeção') COLLATE utf8mb4_bin NOT NULL,
  `description` text COLLATE utf8mb4_bin,
  `startDate` bigint NOT NULL,
  `endDate` bigint DEFAULT NULL,
  `status` enum('Agendada','Em Andamento','Concluída','Cancelada') COLLATE utf8mb4_bin NOT NULL DEFAULT 'Agendada',
  `technician` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `cost` decimal(10,2) DEFAULT NULL,
  `notes` text COLLATE utf8mb4_bin,
  `createdById` int NOT NULL,
  `createdByName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ti_inventario_manutencao_maintenanceId_unique` (`maintenanceId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ti_inventario_movimentacoes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `movementId` varchar(32) COLLATE utf8mb4_bin NOT NULL,
  `itemId` int NOT NULL,
  `itemName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `type` enum('Entrada','Saída','Transferência','Devolução','Manutenção') COLLATE utf8mb4_bin NOT NULL,
  `quantity` int NOT NULL DEFAULT '1',
  `fromLocation` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `toLocation` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `fromUserId` int DEFAULT NULL,
  `fromUserName` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `toUserId` int DEFAULT NULL,
  `toUserName` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `reason` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `notes` text COLLATE utf8mb4_bin,
  `authorizedById` int DEFAULT NULL,
  `authorizedByName` varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `createdById` int NOT NULL,
  `createdByName` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ti_inventario_movimentacoes_movementId_unique` (`movementId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `validades_curtas_itens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `codigo` int NOT NULL,
  `vcRegion` enum('SC','RS') COLLATE utf8mb4_bin NOT NULL,
  `vcTipoProduto` enum('medicamento','nao_medicamento') COLLATE utf8mb4_bin NOT NULL DEFAULT 'medicamento',
  `nomeProduto` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `fornecedor` varchar(255) COLLATE utf8mb4_bin NOT NULL,
  `codLote` varchar(64) COLLATE utf8mb4_bin NOT NULL,
  `vencimentoLote` date NOT NULL,
  `estoqueLote` int NOT NULL DEFAULT '0',
  `estoqueTotal` int NOT NULL DEFAULT '0',
  `vendaMedia` double NOT NULL DEFAULT '0',
  `valorCusto` double DEFAULT NULL,
  `valorEstoqueCusto` double DEFAULT NULL,
  `diasEstoque` double NOT NULL DEFAULT '0',
  `dataUltimaCompra` varchar(32) COLLATE utf8mb4_bin DEFAULT NULL,
  `syncedAt` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `vc_codigo_region_lote_uk` (`codigo`,`vcRegion`,`codLote`)
) ENGINE=InnoDB AUTO_INCREMENT=70 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

