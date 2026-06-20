import net from "node:net";
import tls from "node:tls";

export type EmailConfig = {
  enabled: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password: string;
  from_addr: string;
  to_addr: string;
};

type SmtpSocket = net.Socket | tls.TLSSocket;

const DEFAULT_SMTP_HOST = "smtp.qq.com";

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`缺少 ${name} 环境变量`);
  }
  return value;
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function parsePort(value: string) {
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("SEND_PORT 必须是有效端口号");
  }
  return port;
}

function encodeHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function normalizeAddressList(addresses: string) {
  return addresses
    .split(/[;,]/)
    .map((address) => address.trim())
    .filter(Boolean);
}

function dotStuff(content: string) {
  return content.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
}

function encodeQuotedPrintable(value: string) {
  const bytes = Buffer.from(value.replace(/\r?\n/g, "\r\n"), "utf8");
  const lines: string[] = [];
  let line = "";

  function appendToken(token: string) {
    if (line.length + token.length > 73) {
      lines.push(`${line}=`);
      line = "";
    }
    line += token;
  }

  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    if (byte === 13 && bytes[index + 1] === 10) {
      lines.push(line);
      line = "";
      index += 1;
      continue;
    }

    const token =
      (byte >= 33 && byte <= 60) || (byte >= 62 && byte <= 126)
        ? String.fromCharCode(byte)
        : `=${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    appendToken(token);
  }

  lines.push(line);
  return lines.join("\r\n");
}

function createMessage(config: EmailConfig, subject: string, text: string) {
  const date = new Date().toUTCString();
  return [
    `From: ${config.from_addr}`,
    `To: ${normalizeAddressList(config.to_addr).join(", ")}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: quoted-printable",
    `Message-ID: <${Date.now()}.${Math.random().toString(16).slice(2)}@price-visualization.local>`,
    `Date: ${date}`,
    "",
    encodeQuotedPrintable(text),
  ].join("\r\n");
}

function connectPlain(host: string, port: number) {
  return new Promise<net.Socket>((resolve, reject) => {
    const socket = net.connect({ host, port }, () => resolve(socket));
    socket.once("error", reject);
    socket.setTimeout(30000, () => {
      socket.destroy(new Error("SMTP 连接超时"));
    });
  });
}

function connectTls(host: string, port: number, socket?: net.Socket) {
  return new Promise<tls.TLSSocket>((resolve, reject) => {
    const options: tls.ConnectionOptions = socket
      ? { servername: host, socket }
      : { host, port, servername: host };
    const secureSocket = tls.connect(options, () => resolve(secureSocket));
    secureSocket.once("error", reject);
    secureSocket.setTimeout(30000, () => {
      secureSocket.destroy(new Error("SMTP TLS 连接超时"));
    });
  });
}

class SmtpClient {
  private buffer = "";

  constructor(
    private socket: SmtpSocket,
    private readonly host: string,
  ) {
    this.attachBufferListener();
  }

  private attachBufferListener() {
    this.socket.setEncoding("utf8");
    this.socket.on("data", (chunk: string) => {
      this.buffer += chunk;
    });
  }

  private waitForResponse() {
    return new Promise<string>((resolve, reject) => {
      const read = () => {
        const lines = this.buffer.split(/\r?\n/).filter(Boolean);
        const doneLine = lines.find((line) => /^\d{3} /.test(line));
        if (!doneLine) {
          return;
        }

        const responseEnd = this.buffer.indexOf(doneLine) + doneLine.length;
        const response = this.buffer.slice(0, responseEnd);
        this.buffer = this.buffer.slice(responseEnd).replace(/^\r?\n/, "");
        cleanup();
        resolve(response);
      };

      const onData = () => read();
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const cleanup = () => {
        this.socket.off("data", onData);
        this.socket.off("error", onError);
      };

      this.socket.on("data", onData);
      this.socket.once("error", onError);
      read();
    });
  }

  async expect(expectedCodes: number[]) {
    const response = await this.waitForResponse();
    const code = Number(response.slice(0, 3));
    if (!expectedCodes.includes(code)) {
      throw new Error(`SMTP 返回异常: ${response.trim()}`);
    }
    return response;
  }

  async command(command: string, expectedCodes: number[]) {
    this.socket.write(`${command}\r\n`);
    return this.expect(expectedCodes);
  }

  async startTls() {
    await this.command("STARTTLS", [220]);
    const plainSocket = this.socket as net.Socket;
    this.socket = await connectTls(this.host, 0, plainSocket);
    this.buffer = "";
    this.attachBufferListener();
  }

  close() {
    this.socket.end();
  }
}

export function getEmailConfig(): EmailConfig {
  const smtpHost = process.env.SMTP_HOST?.trim() || DEFAULT_SMTP_HOST;
  const smtpUser = requireEnv("SEND_MAIL");
  const smtpPassword = requireEnv("SEND_KEY");
  const fromAddr = process.env.FROM_ADDR?.trim() || smtpUser;

  return {
    enabled: parseBoolean(process.env.EMAIL_ENABLED, true),
    smtp_host: smtpHost,
    smtp_port: parsePort(requireEnv("SEND_PORT")),
    smtp_user: smtpUser,
    smtp_password: smtpPassword,
    from_addr: fromAddr,
    to_addr: requireEnv("ACCEPT_MAIL"),
  };
}

export async function sendEmail(subject: string, text: string, config = getEmailConfig()) {
  if (!config.enabled) {
    return { skipped: true, message: "邮件提醒未启用" };
  }

  const recipients = normalizeAddressList(config.to_addr);
  if (recipients.length === 0) {
    throw new Error("ACCEPT_MAIL 至少需要配置一个收件邮箱");
  }

  const useImplicitTls = config.smtp_port === 465;
  const initialSocket = useImplicitTls
    ? await connectTls(config.smtp_host, config.smtp_port)
    : await connectPlain(config.smtp_host, config.smtp_port);
  const client = new SmtpClient(initialSocket, config.smtp_host);

  try {
    await client.expect([220]);
    await client.command(`EHLO ${config.smtp_host}`, [250]);
    if (!useImplicitTls) {
      await client.startTls();
      await client.command(`EHLO ${config.smtp_host}`, [250]);
    }
    await client.command("AUTH LOGIN", [334]);
    await client.command(Buffer.from(config.smtp_user).toString("base64"), [334]);
    await client.command(Buffer.from(config.smtp_password).toString("base64"), [235]);
    await client.command(`MAIL FROM:<${config.from_addr}>`, [250]);
    for (const recipient of recipients) {
      await client.command(`RCPT TO:<${recipient}>`, [250, 251]);
    }
    await client.command("DATA", [354]);
    await client.command(`${dotStuff(createMessage(config, subject, text))}\r\n.`, [250]);
    await client.command("QUIT", [221]).catch(() => undefined);
    return { skipped: false, message: `邮件已发送到 ${recipients.join(", ")}` };
  } finally {
    client.close();
  }
}
