class Wssip < Formula
  desc "Proxy application for manipulating WebSocket messages"
  homepage "https://github.com/nccgroup/wssip"
  url "https://registry.npmjs.org/wssip/-/wssip-1.0.5.tgz"
  version "1.0.5"
  sha256 "5a99c352999f001d5bcd5eef73cd2803f6fe453b4522847172501b523d32550f"
  head "https://github.com/nccgroup/wssip.git"

  bottle :unneeded

  depends_on "node"

  def install
    system "npm", "install", "--production", *Language::Node.std_npm_install_args(libexec)
    bin.install_symlink "#{libexec}/bin/wssip" => "wssip"
  end

  test do
    vers = system bin/"wssip", "--version"
    assert_equal vers, '1.0.5'
  end
end
